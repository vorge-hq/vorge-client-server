// P2 · cross-tenant isolation at the repository layer, against REAL Postgres.
// Proves Tenant A cannot read Tenant B (and that same-operator/other-facility
// access is denied for facility-scoped roles). This is the ground truth the
// route layer and RLS policies must also enforce.
const db = require("../../src/db/knex");
const { findUserById } = require("../../src/repositories/userRepository");
const {
  listAssessmentsForUser,
  getAssessmentForUser,
  getAssessmentBundleForUser
} = require("../../src/repositories/assessmentRepository");
const { ROLES } = require("../../src/services/constants");
const { USERS, ASSESSMENTS, truncateAll, seedFixtures } = require("./fixtures");

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

const names = (list) => list.map((a) => a.name).sort();

describe("listAssessmentsForUser is facility/operator scoped", () => {
  test("Author sees only their own facility's assessment", async () => {
    const user = await findUserById(USERS.authorA1.id);
    const list = await listAssessmentsForUser({ user, actingRole: ROLES.AUTHOR });
    expect(names(list)).toEqual([ASSESSMENTS.A1.name]);
    // no other-operator or other-facility rows leaked
    expect(list.some((a) => a.name === ASSESSMENTS.B1.name)).toBe(false);
    expect(list.some((a) => a.name === ASSESSMENTS.A2.name)).toBe(false);
  });

  test("HQ Executive sees all facilities in their operator, none from the other operator", async () => {
    const user = await findUserById(USERS.hqA.id);
    const list = await listAssessmentsForUser({ user, actingRole: ROLES.HQ_EXECUTIVE });
    expect(names(list)).toEqual([ASSESSMENTS.A1.name, ASSESSMENTS.A2.name]);
    expect(list.some((a) => a.name === ASSESSMENTS.B1.name || a.name === ASSESSMENTS.B2.name)).toBe(false);
  });

  test("cross-facility Admin sees their operator only", async () => {
    const user = await findUserById(USERS.adminA.id);
    const list = await listAssessmentsForUser({ user, actingRole: ROLES.ADMIN });
    expect(names(list)).toEqual([ASSESSMENTS.A1.name, ASSESSMENTS.A2.name]);
  });
});

describe("getAssessmentForUser rejects out-of-scope ids (returns null → 404 at the route)", () => {
  test("Author cannot read another operator's assessment", async () => {
    const user = await findUserById(USERS.authorA1.id);
    expect(await getAssessmentForUser({ assessmentId: ASSESSMENTS.B1.id, user, actingRole: ROLES.AUTHOR })).toBeNull();
  });

  test("Author cannot read a sibling facility in the same operator", async () => {
    const user = await findUserById(USERS.authorA1.id);
    expect(await getAssessmentForUser({ assessmentId: ASSESSMENTS.A2.id, user, actingRole: ROLES.AUTHOR })).toBeNull();
  });

  test("Author can read their own facility's assessment", async () => {
    const user = await findUserById(USERS.authorA1.id);
    const a = await getAssessmentForUser({ assessmentId: ASSESSMENTS.A1.id, user, actingRole: ROLES.AUTHOR });
    expect(a).not.toBeNull();
    expect(a.name).toBe(ASSESSMENTS.A1.name);
  });

  test("HQ Executive cannot read the other operator's assessment", async () => {
    const user = await findUserById(USERS.hqA.id);
    expect(await getAssessmentForUser({ assessmentId: ASSESSMENTS.B1.id, user, actingRole: ROLES.HQ_EXECUTIVE })).toBeNull();
  });
});

describe("getAssessmentBundleForUser is scoped", () => {
  test("cross-tenant bundle read returns null", async () => {
    const user = await findUserById(USERS.authorA1.id);
    expect(await getAssessmentBundleForUser({ assessmentId: ASSESSMENTS.B1.id, user, actingRole: ROLES.AUTHOR })).toBeNull();
  });

  test("in-scope bundle returns only that assessment's rows", async () => {
    const user = await findUserById(USERS.authorA1.id);
    const bundle = await getAssessmentBundleForUser({ assessmentId: ASSESSMENTS.A1.id, user, actingRole: ROLES.AUTHOR });
    expect(bundle).not.toBeNull();
    expect(bundle.assets).toHaveLength(1);
    expect(bundle.assets.every((x) => x.facilityId === bundle.assessment.facilityId)).toBe(true);
    expect(bundle.evaluations.every((x) => x.facilityId === bundle.assessment.facilityId)).toBe(true);
  });
});
