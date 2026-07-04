// P3 · audit guarantees for content writes (test-specs §P3 "Audit"). Against
// REAL Postgres so the atomic rollback is proven, not mocked away.
//   - every successful mutation writes exactly ONE audit row with the right shape
//   - failed mutations (409/403/400) write NO content-change audit row
//   - the data write and the audit write are ATOMIC: force the audit insert to
//     fail -> the data change rolls back.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const auditRepository = require("../../src/repositories/auditRepository");
const { ROLES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, FACILITIES, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = ASSESSMENTS.A2;
const ASSET = CHILD.A2.asset;

async function lockVersionOf(id) {
  return (await db("assessments").where({ id }).first()).lock_version;
}
async function contentAuditRows() {
  return db("audit_log_entries").whereIn("action_type", ["asset-created", "asset-updated", "asset-deleted"]);
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await db.destroy();
});

test("a successful PATCH writes exactly ONE audit row with the right shape", async () => {
  const v = await lockVersionOf(A2.id);
  const session = await login("authorA2", ROLES.AUTHOR);

  const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/assets/${ASSET}`), session)
    .set("X-Trace-Id", "trace-audit-1")
    .send({ lockVersion: v, name: "Renamed Asset" });
  expect(res.status).toBe(200);

  const rows = await contentAuditRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action_type: "asset-updated", // lowercase-hyphen vocabulary
    entity_type: "asset",
    entity_id: ASSET,
    assessment_id: A2.id,
    facility_id: FACILITIES.A2.id,
    trace_id: "trace-audit-1"
  });
  // diff carries before/after of changed fields ONLY.
  expect(Object.keys(rows[0].diff)).toEqual(["name"]);
  expect(rows[0].diff.name[0]).not.toBe(rows[0].diff.name[1]);
});

test("a rejected write (409 stale lockVersion) writes NO content audit row", async () => {
  const v = await lockVersionOf(A2.id);
  const session = await login("authorA2", ROLES.AUTHOR);
  const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/assets/${ASSET}`), session)
    .send({ lockVersion: v - 1, name: "x" });
  expect(res.status).toBe(409);
  expect(await contentAuditRows()).toHaveLength(0);
});

test("a rejected write (403 wrong role) writes NO content audit row", async () => {
  // reviewerA1 on A1 (set Draft) is a role rejection, not a scope one.
  await db("assessments").where({ id: ASSESSMENTS.A1.id }).update({ state: "Draft" });
  const v = await lockVersionOf(ASSESSMENTS.A1.id);
  const session = await login("reviewerA1", ROLES.REVIEWER);
  const res = await withAuth(request(app).post(`/api/assessments/${ASSESSMENTS.A1.id}/assets`), session)
    .send({ lockVersion: v, name: "x" });
  expect(res.status).toBe(403);
  expect(await contentAuditRows()).toHaveLength(0);
});

test("ATOMIC: if the audit insert fails, the data write and lock bump roll back", async () => {
  const v = await lockVersionOf(A2.id);
  const assetsBefore = (await db("assets").where({ assessment_id: A2.id })).length;

  jest.spyOn(auditRepository, "appendAuditLog").mockRejectedValueOnce(new Error("forced audit failure"));

  const session = await login("authorA2", ROLES.AUTHOR);
  const res = await withAuth(request(app).post(`/api/assessments/${A2.id}/assets`), session)
    .send({ lockVersion: v, name: "should be rolled back" });

  expect(res.status).toBe(500);
  // The savepoint rolled back: no new asset, no lock bump, no audit row.
  expect((await db("assets").where({ assessment_id: A2.id })).length).toBe(assetsBefore);
  expect(await lockVersionOf(A2.id)).toBe(v);
  expect(await contentAuditRows()).toHaveLength(0);
});
