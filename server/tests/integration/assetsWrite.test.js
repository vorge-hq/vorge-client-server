// P3 · (c) — Assets write REFERENCE suite (supertest + REAL Postgres via the P2
// harness). Proves the six-case ground rules (test-specs §Ground rules rule 4)
// and the state×role guard MATRIX for the reference content endpoint. Optimistic
// concurrency lives in lockVersion.test.js; audit atomicity in writeAudit.test.js;
// cross-tenant in tenantIsolation.test.js. Together those are P3's DoD for assets.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES, ASSESSMENT_STATES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, FACILITIES, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = ASSESSMENTS.A2; // Draft, facility A2, author authorA2 — the write subject.
const A1 = ASSESSMENTS.A1; // seeded In Review, facility A1 — used for the role matrix.

async function assessmentRow(id) {
  return db("assessments").where({ id }).first();
}
async function setState(id, state) {
  await db("assessments").where({ id }).update({ state });
}

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("POST /:id/assets — happy path (201 + response shape + persisted + audit)", () => {
  test("Author creates an asset in a Draft assessment -> 201, row persisted, lockVersion bumped", async () => {
    const before = await assessmentRow(A2.id);
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), session)
      .set("X-Trace-Id", "trace-create-1")
      .send({ lockVersion: before.lock_version, name: "Pump House", assetType: "Utility", criticality: "Medium", details: { note: "primary" } });

    expect(res.status).toBe(201);
    expect(res.body.asset).toMatchObject({ name: "Pump House", assetType: "Utility", criticality: "Medium", assessmentId: A2.id });
    expect(res.body.asset.details).toEqual({ note: "primary" });
    expect(res.body.lockVersion).toBe(before.lock_version + 1);

    const persisted = await db("assets").where({ id: res.body.asset.id }).first();
    expect(persisted).toBeTruthy();
    expect(persisted.facility_id).toBe(FACILITIES.A2.id);
    expect(persisted.assessment_id).toBe(A2.id);

    const after = await assessmentRow(A2.id);
    expect(after.lock_version).toBe(before.lock_version + 1);

    const audit = await db("audit_log_entries").where({ entity_id: res.body.asset.id, action_type: "asset-created" });
    expect(audit).toHaveLength(1);
    expect(audit[0].assessment_id).toBe(A2.id);
    expect(audit[0].facility_id).toBe(FACILITIES.A2.id);
    expect(audit[0].trace_id).toBe("trace-create-1");
    expect(audit[0].diff.name).toEqual([null, "Pump House"]);
  });
});

describe("PATCH /:id/assets/:assetId — happy path (200 + diff of changed fields only)", () => {
  test("Author edits an asset -> 200, only changed fields in the audit diff", async () => {
    const before = await assessmentRow(A2.id);
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/assets/${CHILD.A2.asset}`), session)
      .send({ lockVersion: before.lock_version, criticality: "Critical" });

    expect(res.status).toBe(200);
    expect(res.body.asset.criticality).toBe("Critical");
    expect(res.body.lockVersion).toBe(before.lock_version + 1);

    const audit = await db("audit_log_entries")
      .where({ entity_id: CHILD.A2.asset, action_type: "asset-updated" })
      .orderBy("created_at", "desc")
      .first();
    // Only criticality changed — name/assetType/details must NOT appear.
    expect(Object.keys(audit.diff)).toEqual(["criticality"]);
    expect(audit.diff.criticality).toEqual(["High", "Critical"]);
  });
});

describe("DELETE /:id/assets/:assetId — happy path (200 + row gone + audit)", () => {
  test("Author deletes an asset -> 200, row removed, one asset-deleted audit row", async () => {
    // A throwaway asset so we don't cascade-delete the shared seeded child chain.
    const created = await withAuth(
      request(app).post(`/api/assessments/${A2.id}/assets`),
      await login("authorA2", ROLES.AUTHOR)
    ).send({ lockVersion: (await assessmentRow(A2.id)).lock_version, name: "Temp Shed" });
    const assetId = created.body.asset.id;

    const before = await assessmentRow(A2.id);
    const res = await withAuth(request(app).delete(`/api/assessments/${A2.id}/assets/${assetId}`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: before.lock_version });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: assetId, deleted: true, lockVersion: before.lock_version + 1 });
    expect(await db("assets").where({ id: assetId }).first()).toBeUndefined();

    const audit = await db("audit_log_entries").where({ entity_id: assetId, action_type: "asset-deleted" });
    expect(audit).toHaveLength(1);
  });

  test("DELETE an asset that is not in this assessment -> 404 ASSET_NOT_FOUND", async () => {
    const before = await assessmentRow(A2.id);
    const res = await withAuth(request(app).delete(`/api/assessments/${A2.id}/assets/${CHILD.B1.asset}`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: before.lock_version });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSET_NOT_FOUND");
    // Guard bumped lock_version before the mutation threw, but the whole savepoint
    // rolls back on the throw -> version unchanged.
    expect((await assessmentRow(A2.id)).lock_version).toBe(before.lock_version);
  });
});

describe("400 validation (Zod) — missing/ill lockVersion, bad body", () => {
  test("missing lockVersion -> 400 VALIDATION_ERROR (never silent last-write-wins)", async () => {
    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), await login("authorA2", ROLES.AUTHOR))
      .send({ name: "No Version" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("empty name -> 400 VALIDATION_ERROR", async () => {
    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: 1, name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("401 — unauthenticated write never reaches the mutation", () => {
  test("POST /:id/assets without a token -> 401 UNAUTHENTICATED", async () => {
    const res = await request(app).post(`/api/assessments/${A2.id}/assets`).send({ lockVersion: 1, name: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("403 role matrix — EVERY non-Author role is denied (ROLE_NOT_ALLOWED)", () => {
  // All five non-Author roles below are assigned to facility A1, so each one can
  // LOAD the assessment (passes the scope check) and is then rejected at the role
  // check — proving 403 (role), not 404 (scope). A1 is forced to Draft so the
  // rejection is unambiguously the role guard, not the state guard.
  const NON_AUTHOR = [
    ["reviewerA1", ROLES.REVIEWER],
    ["approverA", ROLES.APPROVER],
    ["hqA", ROLES.HQ_EXECUTIVE],
    ["adminA", ROLES.ADMIN],
    ["mitA", ROLES.MITIGATION_OWNER]
  ];

  test.each(NON_AUTHOR)("%s (%s) cannot POST an asset -> 403 ROLE_NOT_ALLOWED, no row written", async (userKey, role) => {
    await setState(A1.id, ASSESSMENT_STATES.DRAFT);
    const before = await assessmentRow(A1.id);
    const countBefore = (await db("assets").where({ assessment_id: A1.id })).length;

    const res = await withAuth(request(app).post(`/api/assessments/${A1.id}/assets`), await login(userKey, role))
      .send({ lockVersion: before.lock_version, name: "should not persist" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
    expect((await db("assets").where({ assessment_id: A1.id })).length).toBe(countBefore);
    expect((await assessmentRow(A1.id)).lock_version).toBe(before.lock_version);
  });
});

describe("409 state matrix — content writes allowed ONLY in Draft", () => {
  const NON_DRAFT = [ASSESSMENT_STATES.IN_REVIEW, ASSESSMENT_STATES.AWAITING_APPROVAL, ASSESSMENT_STATES.APPROVED];

  test.each(NON_DRAFT)("Author cannot POST an asset while %s -> 409 INVALID_ASSESSMENT_STATE", async (state) => {
    await setState(A2.id, state);
    const before = await assessmentRow(A2.id);

    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: before.lock_version, name: "blocked by state" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_ASSESSMENT_STATE");
    expect((await assessmentRow(A2.id)).lock_version).toBe(before.lock_version);
  });

  test("Draft allows the write -> 201 (proves the matrix isn't vacuously rejecting)", async () => {
    await setState(A2.id, ASSESSMENT_STATES.DRAFT);
    const before = await assessmentRow(A2.id);
    const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: before.lock_version, name: "allowed in draft" });
    expect(res.status).toBe(201);
  });
});
