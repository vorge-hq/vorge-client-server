// P3 · (e) — narrative section text (test-specs §P3 "Section text"). PUT a
// section, GET the assessment bundle, expect the text back verbatim (unicode,
// long, empty). Plus the migration idempotency check and the narrative-set guard.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const knexConfig = require("../../knexfile");
const { ROLES } = require("../../src/services/constants");
const { ASSESSMENTS, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = ASSESSMENTS.A2; // Draft, author authorA2

async function lockVersionOf(id) {
  return (await db("assessments").where({ id }).first()).lock_version;
}
async function authorSession() {
  return login("authorA2", ROLES.AUTHOR);
}
async function putSection(session, n, contentText, lockVersion) {
  return withAuth(request(app).put(`/api/assessments/${A2.id}/sections/${n}`), session).send({ lockVersion, contentText });
}
async function getBundle(session) {
  return withAuth(request(app).get(`/api/assessments/${A2.id}`), session);
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("PUT /sections/:n round-trips through the GET bundle", () => {
  test.each([
    ["unicode", "Résumé — 危険 — \u{1F6A8} mitigations agreed"],
    ["long", "x".repeat(20000)],
    ["empty", ""]
  ])("section 1 text (%s) is returned verbatim", async (_label, text) => {
    const put = await putSection(await authorSession(), 1, text, await lockVersionOf(A2.id));
    expect(put.status).toBe(200);
    expect(put.body.section).toEqual({ sectionNumber: 1, contentText: text });

    const bundle = await getBundle(await authorSession());
    expect(bundle.status).toBe(200);
    expect(bundle.body.sectionTexts["1"]).toBe(text);
  });

  test("a second PUT to the same section overwrites (upsert), not a duplicate row", async () => {
    await putSection(await authorSession(), 8, "first", await lockVersionOf(A2.id));
    await putSection(await authorSession(), 8, "second", await lockVersionOf(A2.id));
    const rows = await db("assessment_sections").where({ assessment_id: A2.id, section_number: 8 });
    expect(rows).toHaveLength(1);
    expect(rows[0].content_text).toBe("second");
  });

  test("a successful section write logs exactly one section-text-updated audit row", async () => {
    await putSection(await authorSession(), 2, "Facility info", await lockVersionOf(A2.id));
    const audit = await db("audit_log_entries").where({ action_type: "section-text-updated", assessment_id: A2.id });
    expect(audit).toHaveLength(1);
    expect(audit[0].diff.contentText).toEqual([null, "Facility info"]);
  });
});

describe("guards reused from the write-guard", () => {
  test("a non-narrative section number -> 400 VALIDATION_ERROR", async () => {
    const res = await putSection(await authorSession(), 3, "not allowed", await lockVersionOf(A2.id));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("stale lockVersion -> 409 LOCK_VERSION_CONFLICT", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await putSection(await authorSession(), 1, "x", v - 1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LOCK_VERSION_CONFLICT");
  });

  test("Reviewer cannot write section text -> 403 ROLE_NOT_ALLOWED", async () => {
    const res = await putSection(await login("reviewerA2", ROLES.REVIEWER), 1, "x", await lockVersionOf(A2.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });
});

describe("migration is additive + idempotent", () => {
  test("running migrate:latest again is a no-op and the table still exists", async () => {
    const migrate = require("knex")(knexConfig.test || knexConfig.development);
    try {
      // Already applied by global-setup; a second run must not throw.
      await migrate.migrate.latest();
      expect(await migrate.schema.hasTable("assessment_sections")).toBe(true);
    } finally {
      await migrate.destroy();
    }
  });
});
