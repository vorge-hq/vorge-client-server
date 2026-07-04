// P3 · (d) — threats / links / evaluations / contributors. All four reuse the
// same write-guard proven exhaustively for assets (assetsWrite/lockVersion/
// writeAudit), so this suite focuses on each entity's OWN behaviour: happy-path
// persistence, the correct audit vocabulary + changed-fields diff, and that the
// shared optimistic-concurrency guard still fires (stale lockVersion → 409).
// Cross-tenant for these mutations lives in tenantIsolation.test.js.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, FACILITIES, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = ASSESSMENTS.A2; // Draft, facility A2, author authorA2
const C = CHILD.A2;

async function lockVersionOf(id) {
  return (await db("assessments").where({ id }).first()).lock_version;
}
async function authorSession() {
  return login("authorA2", ROLES.AUTHOR);
}
async function auditRow(actionType, entityId) {
  return db("audit_log_entries").where({ action_type: actionType, entity_id: entityId }).orderBy("created_at", "desc").first();
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("Threats (Section 4)", () => {
  test("POST creates a threat -> 201, persisted, one threat-created audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/threats`), await authorSession())
      .send({ lockVersion: v, name: "Insider", likelihood: 4, details: { vector: "badge" } });
    expect(res.status).toBe(201);
    expect(res.body.threat).toMatchObject({ name: "Insider", likelihood: 4, assessmentId: A2.id });
    expect(res.body.lockVersion).toBe(v + 1);

    const persisted = await db("threats").where({ id: res.body.threat.id }).first();
    expect(persisted.facility_id).toBe(FACILITIES.A2.id);
    expect(await auditRow("threat-created", res.body.threat.id)).toBeTruthy();
  });

  test("PATCH edits likelihood -> 200, diff carries only likelihood", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/threats/${C.threat}`), await authorSession())
      .send({ lockVersion: v, likelihood: 5 });
    expect(res.status).toBe(200);
    expect(res.body.threat.likelihood).toBe(5);
    const audit = await auditRow("threat-updated", C.threat);
    expect(Object.keys(audit.diff)).toEqual(["likelihood"]);
    expect(audit.diff.likelihood).toEqual([3, 5]);
  });

  test("DELETE removes a threat -> 200, row gone", async () => {
    // create a throwaway (deleting the seeded threat would cascade its link/eval)
    const v0 = await lockVersionOf(A2.id);
    const created = await withAuth(request(app).post(`/api/assessments/${A2.id}/threats`), await authorSession())
      .send({ lockVersion: v0, name: "Temp" });
    const id = created.body.threat.id;
    const res = await withAuth(request(app).delete(`/api/assessments/${A2.id}/threats/${id}`), await authorSession())
      .send({ lockVersion: await lockVersionOf(A2.id) });
    expect(res.status).toBe(200);
    expect(await db("threats").where({ id }).first()).toBeUndefined();
  });

  test("stale lockVersion -> 409 LOCK_VERSION_CONFLICT (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/threats/${C.threat}`), await authorSession())
      .send({ lockVersion: v - 1, likelihood: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LOCK_VERSION_CONFLICT");
  });

  test("Reviewer cannot PATCH a threat -> 403 ROLE_NOT_ALLOWED (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/threats/${C.threat}`), await login("reviewerA2", ROLES.REVIEWER))
      .send({ lockVersion: v, likelihood: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });
});

describe("Asset×threat links (Section 5) — PUT enable/disable", () => {
  test("PUT disables an existing (enabled) link -> 200, diff enabled [true,false], one audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/links/${C.asset}/${C.threat}`), await authorSession())
      .send({ lockVersion: v, enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.link.enabled).toBe(false);
    expect(res.body.lockVersion).toBe(v + 1);
    const persisted = await db("asset_threat_links").where({ id: C.link }).first();
    expect(persisted.enabled).toBe(false);
    const audit = await auditRow("link-updated", C.link);
    expect(audit.diff.enabled).toEqual([true, false]);
  });

  test("PUT for an asset not in this assessment -> 404 LINK_TARGET_NOT_FOUND", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/links/${CHILD.B1.asset}/${C.threat}`), await authorSession())
      .send({ lockVersion: v, enabled: true });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("LINK_TARGET_NOT_FOUND");
    expect(await lockVersionOf(A2.id)).toBe(v); // rolled back
  });

  // P3 (g) follow-on: enabling a pair seeds its evaluation (evaluations have no
  // create endpoint) and echoes it, so Section 6 has a real row to PATCH.
  test("PUT enabling a fresh pair auto-creates an evaluation and echoes it", async () => {
    const s = await authorSession();
    let v = await lockVersionOf(A2.id);
    const a = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), s).send({ lockVersion: v, name: "Freshly added asset" });
    const assetId = a.body.asset.id;
    v = await lockVersionOf(A2.id);
    const t = await withAuth(request(app).post(`/api/assessments/${A2.id}/threats`), s).send({ lockVersion: v, name: "Freshly added threat" });
    const threatId = t.body.threat.id;

    v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/links/${assetId}/${threatId}`), s)
      .send({ lockVersion: v, enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.link.enabled).toBe(true);
    expect(res.body.evaluation).toBeTruthy();
    expect(res.body.evaluation.assetId).toBe(assetId);
    expect(res.body.evaluation.threatId).toBe(threatId);
    const evalRow = await db("evaluations").where({ assessment_id: A2.id, asset_id: assetId, threat_id: threatId }).first();
    expect(evalRow).toBeTruthy();
    expect(res.body.evaluation.id).toBe(evalRow.id);
    // The auto-create is recorded on the link-updated audit row.
    const audit = await auditRow("link-updated", res.body.link.id);
    expect(audit.metadata.evaluationCreated).toBe(evalRow.id);
  });

  test("re-enabling a pair that already has an evaluation echoes it without duplicating", async () => {
    const s = await authorSession();
    let v = await lockVersionOf(A2.id);
    await withAuth(request(app).put(`/api/assessments/${A2.id}/links/${C.asset}/${C.threat}`), s).send({ lockVersion: v, enabled: false });
    v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/links/${C.asset}/${C.threat}`), s).send({ lockVersion: v, enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.evaluation.id).toBe(C.evaluation);
    const count = await db("evaluations").where({ assessment_id: A2.id, asset_id: C.asset, threat_id: C.threat }).count("* as n").first();
    expect(Number(count.n)).toBe(1);
    // No new evaluation was created, so no evaluationCreated metadata.
    const audit = await auditRow("link-updated", C.link);
    expect(audit.metadata?.evaluationCreated).toBeUndefined();
  });
});

describe("Evaluations (Section 6) — PATCH", () => {
  test("PATCH edits scenario -> 200, diff carries only scenario, one audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/evaluations/${C.evaluation}`), await authorSession())
      .send({ lockVersion: v, scenario: "Revised scenario text" });
    expect(res.status).toBe(200);
    expect(res.body.evaluation.scenario).toBe("Revised scenario text");
    const audit = await auditRow("evaluation-updated", C.evaluation);
    expect(Object.keys(audit.diff)).toEqual(["scenario"]);
  });

  test("PATCH updates the R1 risk object -> 200, diff carries r1", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/evaluations/${C.evaluation}`), await authorSession())
      .send({ lockVersion: v, r1: { score: 20, band: "Critical" } });
    expect(res.status).toBe(200);
    expect(res.body.evaluation.r1).toEqual({ score: 20, band: "Critical" });
    const audit = await auditRow("evaluation-updated", C.evaluation);
    expect(audit.diff.r1[1]).toEqual({ score: 20, band: "Critical" });
  });

  test("stale lockVersion -> 409 (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/evaluations/${C.evaluation}`), await authorSession())
      .send({ lockVersion: v - 1, scenario: "x" });
    expect(res.status).toBe(409);
  });
});

describe("Contributors (Section 9.A) — PUT replaces the list", () => {
  test("PUT replaces contributors -> 200, persisted on the assessment, one audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const contributors = [{ name: "Jane Doe", role: "Engineer" }, { name: "Sam Lee", role: "Safety" }];
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/contributors`), await authorSession())
      .send({ lockVersion: v, contributors });
    expect(res.status).toBe(200);
    expect(res.body.contributors).toEqual(contributors);
    expect(res.body.lockVersion).toBe(v + 1);

    const row = await db("assessments").where({ id: A2.id }).first();
    expect(row.contributors).toEqual(contributors);
    const audit = await auditRow("contributors-updated", A2.id);
    expect(audit.diff.contributors[1]).toEqual(contributors);
  });

  test("stale lockVersion -> 409 (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/contributors`), await authorSession())
      .send({ lockVersion: v - 1, contributors: [] });
    expect(res.status).toBe(409);
  });
});
