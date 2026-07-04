// P3 · optimistic concurrency (test-specs §P3 "Optimistic concurrency").
// Proven against REAL Postgres — the true race relies on row-level locking, so a
// mocked DB could not prove it. Subject: assets on the Draft assessment A2.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = ASSESSMENTS.A2;
const ASSET = CHILD.A2.asset;

async function lockVersionOf(id) {
  return (await db("assessments").where({ id }).first()).lock_version;
}
function patch(session, lockVersion, body = {}) {
  return withAuth(request(app).patch(`/api/assessments/${A2.id}/assets/${ASSET}`), session).send({ lockVersion, ...body });
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

test("correct lockVersion -> 200; response + DB both carry the incremented version", async () => {
  const v = await lockVersionOf(A2.id);
  const session = await login("authorA2", ROLES.AUTHOR);
  const res = await patch(session, v, { name: "renamed" });
  expect(res.status).toBe(200);
  expect(res.body.lockVersion).toBe(v + 1);
  expect(await lockVersionOf(A2.id)).toBe(v + 1);
});

test("stale lockVersion -> 409 LOCK_VERSION_CONFLICT; DB row UNCHANGED", async () => {
  const v = await lockVersionOf(A2.id);
  const session = await login("authorA2", ROLES.AUTHOR);
  const before = await db("assets").where({ id: ASSET }).first();

  const res = await patch(session, v - 1, { name: "should not apply" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("LOCK_VERSION_CONFLICT");

  const after = await db("assets").where({ id: ASSET }).first();
  expect(after.name).toBe(before.name);
  expect(await lockVersionOf(A2.id)).toBe(v); // no bump on a rejected write
});

test("missing lockVersion -> 400 (never a silent last-write-wins)", async () => {
  const session = await login("authorA2", ROLES.AUTHOR);
  const res = await withAuth(request(app).patch(`/api/assessments/${A2.id}/assets/${ASSET}`), session).send({ name: "x" });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
});

test("TRUE RACE: two concurrent PATCHes with the SAME lockVersion -> exactly one 200 + one 409", async () => {
  const v = await lockVersionOf(A2.id);
  const s1 = await login("authorA2", ROLES.AUTHOR);
  const s2 = await login("authorA2", ROLES.AUTHOR);

  // Fire both before awaiting either — genuine concurrency, not sequential.
  const [r1, r2] = await Promise.all([patch(s1, v, { name: "writer-1" }), patch(s2, v, { name: "writer-2" })]);

  const statuses = [r1.status, r2.status].sort();
  expect(statuses).toEqual([200, 409]);
  const conflict = [r1, r2].find((r) => r.status === 409);
  expect(conflict.body.error.code).toBe("LOCK_VERSION_CONFLICT");

  // Exactly one bump — the winner's — landed.
  expect(await lockVersionOf(A2.id)).toBe(v + 1);
});
