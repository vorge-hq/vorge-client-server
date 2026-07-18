// §Guest read-only access · G3 — the positive access + isolation battery
// (G-I1…G-I10) plus regression (G-R1…G-R3). Real JWT / session / Postgres.
// Proves the guest can self-serve sign in (MFA-exempt), READ its one facility,
// is 404'd out of every sibling/cross-tenant resource, cannot export or escalate,
// cannot enroll MFA — AND that the G-block changes broke nothing for real roles.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const env = require("../../src/config/env");
const sessionService = require("../../src/services/sessionService");
const { findUserById } = require("../../src/repositories/userRepository");
const { ROLES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, FACILITIES, USERS, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const GUEST_PW = "guest-explore-pw";

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  // Give the guest a real password so the self-serve login path (G-I1) is
  // exercised for real; fixtures otherwise use a non-matching placeholder hash.
  const hash = await bcrypt.hash(GUEST_PW, 4);
  await db("users").where({ id: USERS.guestA1.id }).update({ password_hash: hash });
});

afterAll(async () => {
  await db.destroy();
});

describe("§Guest — self-serve login is MFA-exempt (G-I1)", () => {
  test("POST /api/auth/login → 200, no MFA challenge, and the token authenticates /me", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.guestA1.email, password: GUEST_PW });
    expect(res.status).toBe(200);
    expect(res.body.actingRole).toBe(ROLES.GUEST);
    expect(res.body.mfaRequired).not.toBe(true); // self-serve: no MFA step
    expect(typeof res.body.token).toBe("string");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });
});

describe("§Guest — scoped reads work (G-I2, G-I3, G-I4)", () => {
  test("G-I2 GET /api/assessments lists ONLY the guest's facility assessment", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    const res = await withAuth(request(app).get("/api/assessments"), guest);
    expect(res.status).toBe(200);
    const ids = res.body.assessments.map((a) => a.id);
    expect(ids).toContain(ASSESSMENTS.A1.id);
    // sibling facility + both Op-B assessments are absent (explicit ids)
    expect(ids).not.toContain(ASSESSMENTS.A2.id);
    expect(ids).not.toContain(ASSESSMENTS.B1.id);
    expect(ids).not.toContain(ASSESSMENTS.B2.id);
  });

  test("G-I3 GET /api/assessments/:id → read-only permissions + real bundle content", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.A1.id}`), guest);
    expect(res.status).toBe(200);
    expect(res.body.assessment.id).toBe(ASSESSMENTS.A1.id);
    expect(res.body.permissions.canRead).toBe(true);
    expect(res.body.permissions.canEditContent).toBe(false);
    expect(res.body.permissions.canExport).toBe(false);
    expect(res.body.allowedWorkflowActions).toEqual([]);
    // reads genuinely work — the child collections hydrate
    expect(Array.isArray(res.body.assets)).toBe(true);
    expect(Array.isArray(res.body.threats)).toBe(true);
    expect(res.body.assets.length).toBeGreaterThan(0);
  });

  test("G-I4 guest reads in-scope library but is denied owner/HQ/admin surfaces", async () => {
    const guest = await login("guestA1", ROLES.GUEST);

    const lib = await withAuth(request(app).get(`/api/library?facilityId=${FACILITIES.A1.id}`), guest);
    expect(lib.status).toBe(200);
    expect(Array.isArray(lib.body.entries)).toBe(true);

    const mine = await withAuth(request(app).get("/api/mitigations/mine"), guest);
    expect(mine.status).toBe(403);
    expect(mine.body.error.code).toBe("ROLE_NOT_ALLOWED");

    const flags = await withAuth(request(app).get("/api/assessments/consistency-flags"), guest);
    expect(flags.status).toBe(403);
    expect(flags.body.error.code).toBe("ROLE_NOT_ALLOWED");

    const admin = await withAuth(request(app).get("/api/admin/configuration"), guest);
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });
});

describe("§Guest — isolation: no sibling or cross-tenant read (G-I5, G-I6)", () => {
  test("G-I5 sibling facility (same operator, no guest assignment) → 404, no existence leak", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    const res = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.A2.id}`), guest);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("G-I6 cross-tenant (Op-B) assessment → 404, and Op-B ids absent from the list", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    const byId = await withAuth(request(app).get(`/api/assessments/${ASSESSMENTS.B1.id}`), guest);
    expect(byId.status).toBe(404);
    expect(byId.body.error.code).toBe("ASSESSMENT_NOT_FOUND");

    const list = await withAuth(request(app).get("/api/assessments"), guest);
    const ids = list.body.assessments.map((a) => a.id);
    expect(ids).not.toContain(ASSESSMENTS.B1.id);
    expect(ids).not.toContain(ASSESSMENTS.B2.id);
  });
});

describe("§Guest — export blocked, no audit row (G-I7)", () => {
  test("GET /:id/export → 403 ROLE_NOT_ALLOWED and no export audit row for the guest", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    const res = await withAuth(
      request(app).get(`/api/assessments/${ASSESSMENTS.A1.id}/export`).query({ format: "docx" }),
      guest
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");

    const rows = await db("audit_log_entries").where({ action_type: "export", user_id: USERS.guestA1.id });
    expect(rows).toHaveLength(0);
  });
});

describe("§Guest — cannot escalate (G-I8, G-I9)", () => {
  test("G-I8 switch-role to any privileged role → 403 ROLE_NOT_ASSIGNED", async () => {
    const guest = await login("guestA1", ROLES.GUEST);
    for (const role of [ROLES.AUTHOR, ROLES.ADMIN, ROLES.REVIEWER]) {
      const res = await withAuth(request(app).post("/api/auth/switch-role"), guest).send({ role });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("ROLE_NOT_ASSIGNED");
    }
  });

  test("G-I9 a forged token claiming actingRole:Author → 403 ROLE_NOT_ASSIGNED", async () => {
    const guestUser = await findUserById(USERS.guestA1.id);
    // A real, valid session for the guest — only the signed actingRole claim is hostile.
    const { sid } = await sessionService.issueSession({ user: guestUser, actingRole: ROLES.GUEST, mfaSatisfied: true });
    const forged = jwt.sign(
      { email: guestUser.email, actingRole: ROLES.AUTHOR, sid },
      env.jwtSecret,
      { subject: guestUser.id, expiresIn: env.jwtExpiresIn }
    );
    const res = await request(app)
      .get(`/api/assessments/${ASSESSMENTS.A1.id}`)
      .set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ASSIGNED"); // hasAssignedRole rejects the claim
  });
});

describe("§Guest — MFA self-enrollment blocked (G-I10)", () => {
  test("enroll-start/enroll-verify → 403, and the guest's mfa_enabled stays false", async () => {
    const guest = await login("guestA1", ROLES.GUEST);

    const start = await withAuth(request(app).post("/api/auth/mfa/enroll-start"), guest).send({});
    expect(start.status).toBe(403);
    expect(start.body.error.code).toBe("ROLE_NOT_ALLOWED");

    const verify = await withAuth(request(app).post("/api/auth/mfa/enroll-verify"), guest).send({ code: "000000" });
    expect(verify.status).toBe(403);
    expect(verify.body.error.code).toBe("ROLE_NOT_ALLOWED");

    const user = await db("users").where({ id: USERS.guestA1.id }).first();
    expect(user.mfa_enabled).toBe(false);
  });
});

describe("§Guest — regression: real roles unaffected (G-R1…G-R3)", () => {
  test("G-R1 Author still writes content (200 + lock_version bump)", async () => {
    const before = await db("assessments").where({ id: ASSESSMENTS.A2.id }).first();
    const author = await login("authorA2", ROLES.AUTHOR); // A2 is Draft, authored by authorA2
    const res = await withAuth(request(app).put(`/api/assessments/${ASSESSMENTS.A2.id}/sections/1`), author).send({
      lockVersion: before.lock_version,
      contentText: "Author edit after the guest side-quest."
    });
    expect(res.status).toBe(200);
    const after = await db("assessments").where({ id: ASSESSMENTS.A2.id }).first();
    expect(after.lock_version).toBe(before.lock_version + 1);
  });

  test("G-R2 Mitigation Owner is still denied on AI (rejectMitigationOwner intact)", async () => {
    const mit = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await withAuth(
      request(app).post(`/api/assessments/${ASSESSMENTS.A1.id}/evaluations/${CHILD.A1.evaluation}/suggest-tags`),
      mit
    ).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("G-R3 export still works for a permitted role (Reviewer) — 200 + audit row", async () => {
    const reviewer = await login("reviewerA1", ROLES.REVIEWER);
    const res = await withAuth(
      request(app).get(`/api/assessments/${ASSESSMENTS.A1.id}/export`).query({ format: "docx" }),
      reviewer
    );
    expect(res.status).toBe(200);
    const rows = await db("audit_log_entries").where({
      action_type: "export",
      assessment_id: ASSESSMENTS.A1.id,
      user_id: USERS.reviewerA1.id
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
