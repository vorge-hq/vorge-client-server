// P2 · Deliverable 2 — cross-tenant ROUTE matrix (supertest + REAL Postgres).
// The penetration proof: driving the live middleware+route stack, an Op-A user
// targeting an Op-B resource must never read or mutate it. This complements the
// repo-layer proof (tenantIsolation.repo.test.js) by exercising the HTTP edge
// exactly as an attacker would: real JWT, real session, real DB.
//
// The matrix, per docs/test-specs.md §P2 deliverable 2:
//   - GET by id cross-tenant  -> 404 (ASSESSMENT_NOT_FOUND), never 403 (no existence leak).
//   - List endpoints          -> only own-tenant rows; the other tenant's ids are absent.
//   - Mutations cross-tenant  -> 404, AND the target row is unchanged in the DB afterward.
//   - Wrong role              -> 403 (both "role not allowed for action" and "role not assigned").
//   - Unauthenticated         -> 401.
//   - HQ Executive of Op-A    -> all Op-A facilities, ZERO Op-B rows.
//   - Cross-facility Admin     -> within its own operator only.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES } = require("../../src/services/constants");
const { ACTIONS } = require("../../src/services/assessmentStateMachine");
const { ASSESSMENTS, CHILD, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

// Actions referenced below, resolved from the state machine so a vocabulary
// rename can't silently rot this test into passing against the wrong action.
const SUBMIT = ACTIONS.SUBMIT_FOR_REVIEW;

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("GET /api/assessments/:id — cross-tenant reads 404 (no existence leak)", () => {
  test("Author (Op-A) reading an Op-B assessment -> 404 ASSESSMENT_NOT_FOUND", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.B1.id}`), session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("Author (Op-A, facility A1) reading a SIBLING facility (A2, same operator) -> 404", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.A2.id}`), session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("HQ Executive (Op-A) reading an Op-B assessment -> 404", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.B1.id}`), session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("sanity: Author reading their OWN facility's assessment -> 200", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.A1.id}`), session);
    expect(res.status).toBe(200);
    expect(res.body.assessment.id).toBe(ASSESSMENTS.A1.id);
  });
});

describe("GET /api/assessments — list returns own-tenant rows only", () => {
  test("Author (facility A1) sees only A1; A2 and both Op-B ids absent", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get("/api/assessments"), session);
    expect(res.status).toBe(200);
    const ids = res.body.assessments.map((a) => a.id);
    expect(ids).toContain(ASSESSMENTS.A1.id);
    expect(ids).not.toContain(ASSESSMENTS.A2.id);
    expect(ids).not.toContain(ASSESSMENTS.B1.id);
    expect(ids).not.toContain(ASSESSMENTS.B2.id);
  });

  test("HQ Executive (Op-A) sees ALL Op-A facilities, ZERO Op-B rows (§17.5 portfolio)", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments"), session);
    expect(res.status).toBe(200);
    const ids = res.body.assessments.map((a) => a.id).sort();
    expect(ids).toEqual([ASSESSMENTS.A1.id, ASSESSMENTS.A2.id].sort());
    expect(ids).not.toContain(ASSESSMENTS.B1.id);
    expect(ids).not.toContain(ASSESSMENTS.B2.id);
  });

  test("cross-facility Admin (Op-A) is scoped to its own operator only", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get("/api/assessments"), session);
    expect(res.status).toBe(200);
    const ids = res.body.assessments.map((a) => a.id).sort();
    expect(ids).toEqual([ASSESSMENTS.A1.id, ASSESSMENTS.A2.id].sort());
    expect(ids.some((idv) => idv === ASSESSMENTS.B1.id || idv === ASSESSMENTS.B2.id)).toBe(false);
  });

  test("HQ Executive (Op-B) sees only Op-B facilities (mirror, proves symmetry)", async () => {
    const session = await login("hqB", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments"), session);
    expect(res.status).toBe(200);
    const ids = res.body.assessments.map((a) => a.id).sort();
    expect(ids).toEqual([ASSESSMENTS.B1.id, ASSESSMENTS.B2.id].sort());
  });
});

describe("POST /api/assessments/:id/workflow — cross-tenant mutation blocked + DB unchanged", () => {
  test("Author (Op-A) transitioning an Op-B assessment -> 404, B1 state unchanged", async () => {
    const before = await db("assessments").where({ id: ASSESSMENTS.B1.id }).first();
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(`/api/assessments/${ASSESSMENTS.B1.id}/workflow`), session)
      .send({ action: SUBMIT });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");

    const after = await db("assessments").where({ id: ASSESSMENTS.B1.id }).first();
    expect(after.state).toBe(before.state);
    expect(after.lock_version).toBe(before.lock_version);
  });
});

describe("POST /api/mitigations/:id/log — cross-tenant mutation blocked + DB unchanged", () => {
  test("Mitigation Owner (Op-A) logging against an Op-B mitigation -> 404, no progress log written", async () => {
    const mitigationB1 = CHILD.B1.mitigation;
    const beforeLogs = await db("mitigation_progress_logs").where({ mitigation_id: mitigationB1 });
    const beforeRow = await db("mitigations").where({ id: mitigationB1 }).first();

    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await withAuth(request(app).post(`/api/mitigations/${mitigationB1}/log`), session)
      .send({ nextStatus: "In Progress", note: "cross-tenant attempt" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MITIGATION_NOT_FOUND");

    const afterLogs = await db("mitigation_progress_logs").where({ mitigation_id: mitigationB1 });
    const afterRow = await db("mitigations").where({ id: mitigationB1 }).first();
    expect(afterLogs).toHaveLength(beforeLogs.length);
    expect(afterRow.status).toBe(beforeRow.status);
  });
});

describe("P3 content mutations — cross-tenant blocked + target row unchanged", () => {
  // Op-A Author targeting an Op-B assessment's assets. The 404 fires at load
  // (getAssessmentForUser → null) BEFORE any role/state/lock check, so a valid
  // lockVersion body still 404s. Each case asserts the Op-B data is untouched.
  test("POST asset onto an Op-B assessment -> 404, no asset added to B1", async () => {
    const countBefore = (await db("assets").where({ assessment_id: ASSESSMENTS.B1.id })).length;
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(`/api/assessments/${ASSESSMENTS.B1.id}/assets`), session)
      .send({ lockVersion: 1, name: "cross-tenant asset" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
    expect((await db("assets").where({ assessment_id: ASSESSMENTS.B1.id })).length).toBe(countBefore);
  });

  test("PATCH an Op-B asset -> 404, B1 asset unchanged", async () => {
    const before = await db("assets").where({ id: CHILD.B1.asset }).first();
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).patch(`/api/assessments/${ASSESSMENTS.B1.id}/assets/${CHILD.B1.asset}`), session)
      .send({ lockVersion: 1, name: "hijacked" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
    const after = await db("assets").where({ id: CHILD.B1.asset }).first();
    expect(after.name).toBe(before.name);
  });

  test("DELETE an Op-B asset -> 404, B1 asset still present", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).delete(`/api/assessments/${ASSESSMENTS.B1.id}/assets/${CHILD.B1.asset}`), session)
      .send({ lockVersion: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
    expect(await db("assets").where({ id: CHILD.B1.asset }).first()).toBeTruthy();
  });
});

describe("Wrong role -> 403 (within own tenant)", () => {
  test("Reviewer cannot submit_for_review (403 ROLE_NOT_ALLOWED), even on an in-scope assessment", async () => {
    // reviewerA2 can READ A2 (own facility) but the state machine forbids the
    // action for a Reviewer — so this fails at the role check, not the scope
    // check, proving 403 vs 404 are distinguished correctly.
    const session = await login("reviewerA2", ROLES.REVIEWER);
    const res = await withAuth(request(app).post(`/api/assessments/${ASSESSMENTS.A2.id}/workflow`), session)
      .send({ action: SUBMIT });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("Non-admin acting role -> 403 on /api/admin/configuration", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get("/api/admin/configuration"), session);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("Non-Mitigation-Owner -> 403 on GET /api/mitigations/mine", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get("/api/mitigations/mine"), session);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("Requesting an acting role the user is NOT assigned -> 403 ROLE_NOT_ASSIGNED", async () => {
    // authorA1 holds only Author; forcing X-Acting-Role: Approver must be rejected.
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(
      request(app).get("/api/assessments"),
      session,
      ROLES.APPROVER
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ASSIGNED");
  });
});

describe("Unauthenticated -> 401", () => {
  test("GET /api/assessments without a token -> 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/assessments");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("GET /api/assessments/:id without a token -> 401", async () => {
    const res = await request(app).get(`/api/assessments/${ASSESSMENTS.A1.id}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("POST workflow without a token -> 401 (mutation never reached)", async () => {
    const res = await request(app).post(`/api/assessments/${ASSESSMENTS.A1.id}/workflow`).send({ action: SUBMIT });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
