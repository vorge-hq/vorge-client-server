// P2 · RLS app wiring — proves the request-scoping seam actually drives RLS.
//
// rls.test.js proves the POLICY (raw SQL as the non-owner role). This proves the
// APP GLUE on top of it: that a repository call made through activeConn() sees
// only the facility context that runInFacilityScope pinned — and, crucially,
// sees NOTHING when no context is pinned. That second half is what guarantees a
// non-owner-role app can never accidentally read across tenants even if the
// repo-layer filter were bypassed.
//
// The repositories default to `trx = activeConn()`, so calling them with no trx
// INSIDE runInFacilityScope automatically uses the scoped, GUC-carrying
// transaction — exactly what the facilityScope middleware does per request.
const knexLib = require("knex");
const db = require("../../src/db/knex"); // owner — seeds + reads users past RLS.
const { requireTestDbUrl } = require("./requireTestDb");
const { APP_ROLE, APP_PASSWORD } = require("./global-setup");
const { FACILITIES, ASSESSMENTS, USERS, truncateAll, seedFixtures } = require("./fixtures");
const { runInFacilityScope } = require("../../src/db/requestScope");
const { resolveFacilityIds } = require("../../src/middleware/facilityScope");
const { listAssessmentsForUser } = require("../../src/repositories/assessmentRepository");
const { findUserById } = require("../../src/repositories/userRepository");
const { ROLES } = require("../../src/services/constants");

function appRoleConnectionString() {
  const url = new URL(requireTestDbUrl());
  url.username = APP_ROLE;
  url.password = APP_PASSWORD;
  return url.toString();
}

let appDb;
let authorA1;
let hqA;

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  appDb = knexLib({
    client: "pg",
    connection: { connectionString: appRoleConnectionString(), ssl: false },
    pool: { min: 1, max: 1 }
  });
  // Real user objects (role assignments carry operatorId/crossFacility), loaded
  // via the owner connection since users/role_assignments have no RLS policy.
  authorA1 = await findUserById(USERS.authorA1.id);
  hqA = await findUserById(USERS.hqA.id);
});

afterAll(async () => {
  await appDb.destroy();
  await db.destroy();
});

describe("RLS app wiring (runInFacilityScope + activeConn) as the non-owner role", () => {
  test("WIRED: a repo read inside runInFacilityScope sees the scoped facility's rows", async () => {
    const rows = await runInFacilityScope(
      [FACILITIES.A1.id],
      () => listAssessmentsForUser({ user: authorA1, actingRole: ROLES.AUTHOR }),
      appDb
    );
    expect(rows.map((r) => r.id)).toEqual([ASSESSMENTS.A1.id]);
  });

  test("UNWIRED: the same read WITHOUT a facility context returns nothing (RLS default-deny)", async () => {
    // trx: appDb runs outside any set_config transaction → GUC unset → RLS denies
    // every row. This is the safety net: no context, no data — even though the
    // repo's own facility filter would have allowed facility A1.
    const rows = await listAssessmentsForUser({ user: authorA1, actingRole: ROLES.AUTHOR, trx: appDb });
    expect(rows).toEqual([]);
  });

  test("operator-wide role expands to its facilities (resolveFacilityIds)", async () => {
    const ids = await resolveFacilityIds({ user: hqA, actingRole: ROLES.HQ_EXECUTIVE });
    expect(new Set(ids)).toEqual(new Set([FACILITIES.A1.id, FACILITIES.A2.id]));
  });

  test("WIRED HQ Executive: scoped to its operator's facilities, zero cross-operator rows", async () => {
    const ids = await resolveFacilityIds({ user: hqA, actingRole: ROLES.HQ_EXECUTIVE });
    const rows = await runInFacilityScope(
      ids,
      () => listAssessmentsForUser({ user: hqA, actingRole: ROLES.HQ_EXECUTIVE }),
      appDb
    );
    const got = rows.map((r) => r.id).sort();
    expect(got).toEqual([ASSESSMENTS.A1.id, ASSESSMENTS.A2.id].sort());
    expect(got).not.toContain(ASSESSMENTS.B1.id);
    expect(got).not.toContain(ASSESSMENTS.B2.id);
  });

  test("runInFacilityScope rolls back / propagates when work throws", async () => {
    await expect(
      runInFacilityScope([FACILITIES.A1.id], async () => {
        throw new Error("boom");
      }, appDb)
    ).rejects.toThrow("boom");
  });
});
