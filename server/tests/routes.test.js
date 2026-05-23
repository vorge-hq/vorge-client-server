const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const env = require("../src/config/env");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../src/services/constants");

jest.mock("../src/db/knex", () => ({
  transaction: jest.fn(async (callback) => callback("trx"))
}));

jest.mock("../src/repositories/auditRepository", () => ({
  appendAuditLog: jest.fn(async () => ({ hash: "hash" }))
}));

jest.mock("../src/repositories/userRepository", () => ({
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  firstRoleAssignment: jest.fn((user) => user?.roleAssignments?.[0] || null),
  hasAssignedRole: jest.fn((user, role) => Boolean(user?.roleAssignments?.some((assignment) => assignment.role === role))),
  publicUser: jest.fn((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    mfaEnabled: user.mfaEnabled,
    roleAssignments: user.roleAssignments,
    roles: user.roleAssignments
  }))
}));

jest.mock("../src/repositories/assessmentRepository", () => ({
  createVersionSnapshot: jest.fn(),
  getAssessmentBundleForUser: jest.fn(),
  getAssessmentForUser: jest.fn(),
  listAssessmentsForUser: jest.fn(),
  updateAssessmentState: jest.fn()
}));

jest.mock("../src/repositories/mitigationRepository", () => ({
  applyMitigationUpdate: jest.fn(),
  getMitigationForUser: jest.fn(),
  listMine: jest.fn()
}));

jest.mock("../src/repositories/sessionRepository", () => {
  const active = new Set();
  return {
    __active: active,
    createSession: jest.fn(async ({ id, userId }) => {
      active.add(id);
      return { id, userId };
    }),
    findActiveSessionById: jest.fn(async (sid) => (active.has(sid) ? { id: sid } : null)),
    revokeSession: jest.fn(async (sid) => (active.delete(sid) ? 1 : 0)),
    cleanupExpiredSessions: jest.fn(async () => 0)
  };
});

const app = require("../src/app");
const userRepository = require("../src/repositories/userRepository");
const assessmentRepository = require("../src/repositories/assessmentRepository");
const mitigationRepository = require("../src/repositories/mitigationRepository");
const sessionRepository = require("../src/repositories/sessionRepository");

const user = {
  id: "user-1",
  email: "author@example.com",
  name: "Demo Author",
  mfaEnabled: true,
  passwordHash: bcrypt.hashSync("VantageDemo123!", 4),
  roleAssignments: [
    { role: ROLES.AUTHOR, facilityId: "facility-1", operatorId: "operator-1" },
    { role: ROLES.REVIEWER, facilityId: "facility-1", operatorId: "operator-1" },
    { role: ROLES.MITIGATION_OWNER, facilityId: "facility-1", operatorId: "operator-1" }
  ],
  roles: [ROLES.AUTHOR, ROLES.REVIEWER, ROLES.MITIGATION_OWNER],
  facilities: [{ id: "facility-1", name: "Demo Facility", operatorId: "operator-1" }]
};

function tokenFor(actingRole = ROLES.AUTHOR, sid = "test-sid", subject = user.id, email = user.email) {
  return jwt.sign({ email, actingRole, sid }, env.jwtSecret, { subject, expiresIn: "1h" });
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionRepository.__active.clear();
  sessionRepository.__active.add("test-sid");
  userRepository.findUserByEmail.mockResolvedValue(user);
  userRepository.findUserById.mockResolvedValue(user);
});

describe("database-backed route wiring", () => {
  test("logs in against the user repository and returns a session token", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    expect(response.body.token).toBeTruthy();
    expect(response.body.actingRole).toBe(ROLES.AUTHOR);
    expect(response.body.user.roleAssignments).toHaveLength(3);
  });

  test("returns facility-scoped assessment detail with permissions and workflow actions", async () => {
    assessmentRepository.getAssessmentBundleForUser.mockResolvedValue({
      assessment: {
        id: "assessment-1",
        facilityId: "facility-1",
        operatorId: "operator-1",
        state: ASSESSMENT_STATES.IN_REVIEW
      },
      assets: [],
      threats: [],
      links: [],
      evaluations: [],
      mitigations: []
    });

    const response = await request(app)
      .get("/api/assessments/assessment-1")
      .set("Authorization", `Bearer ${tokenFor(ROLES.REVIEWER)}`)
      .set("X-Acting-Role", ROLES.REVIEWER)
      .expect(200);

    expect(response.body.permissions.canRead).toBe(true);
    expect(response.body.allowedWorkflowActions).toContain("complete_review");
  });

  test("persists assessment workflow transitions through the repository", async () => {
    assessmentRepository.getAssessmentForUser.mockResolvedValue({
      id: "assessment-1",
      facilityId: "facility-1",
      operatorId: "operator-1",
      state: ASSESSMENT_STATES.IN_REVIEW
    });
    assessmentRepository.updateAssessmentState.mockResolvedValue({
      id: "assessment-1",
      state: ASSESSMENT_STATES.AWAITING_APPROVAL
    });

    const response = await request(app)
      .post("/api/assessments/assessment-1/workflow")
      .set("Authorization", `Bearer ${tokenFor(ROLES.REVIEWER)}`)
      .set("X-Acting-Role", ROLES.REVIEWER)
      .send({ action: "complete_review" })
      .expect(200);

    expect(response.body.transition.to).toBe(ASSESSMENT_STATES.AWAITING_APPROVAL);
    expect(assessmentRepository.updateAssessmentState).toHaveBeenCalledWith(
      expect.objectContaining({ fromState: ASSESSMENT_STATES.IN_REVIEW, toState: ASSESSMENT_STATES.AWAITING_APPROVAL })
    );
  });

  test("persists mitigation progress updates through the repository", async () => {
    mitigationRepository.getMitigationForUser.mockResolvedValue({
      id: "mitigation-1",
      facilityId: "facility-1",
      assessmentId: "assessment-1",
      assessmentState: ASSESSMENT_STATES.APPROVED,
      ownerUserId: user.id,
      ownerLabel: "Security Manager",
      status: MITIGATION_STATUSES.IN_PROGRESS
    });
    mitigationRepository.applyMitigationUpdate.mockResolvedValue({ id: "log-1", note: "Installed" });

    const response = await request(app)
      .post("/api/mitigations/mitigation-1/log")
      .set("Authorization", `Bearer ${tokenFor(ROLES.MITIGATION_OWNER)}`)
      .set("X-Acting-Role", ROLES.MITIGATION_OWNER)
      .send({ nextStatus: MITIGATION_STATUSES.DONE, note: "Installed" })
      .expect(200);

    expect(response.body.update.status).toBe(MITIGATION_STATUSES.DONE);
    expect(response.body.progressLog).toEqual({ id: "log-1", note: "Installed" });
  });
});

describe("auth session lifecycle", () => {
  test("login mints a token carrying both sub and sid claims", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const payload = jwt.verify(response.body.token, env.jwtSecret);
    expect(payload.sub).toBe(user.id);
    expect(payload.sid).toEqual(expect.any(String));
    expect(sessionRepository.__active.has(payload.sid)).toBe(true);
  });

  test("logout revokes the session and subsequent requests with the same token are rejected", async () => {
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const token = loginResponse.body.token;

    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200);

    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`).expect(204);

    const meAfter = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    expect(meAfter.body.error.code).toBe("INVALID_TOKEN");

    const logoutAgain = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    expect(logoutAgain.body.error.code).toBe("INVALID_TOKEN");
  });

  test("switch-role rotates the session: old token rejected, new token works", async () => {
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const oldToken = loginResponse.body.token;
    const oldSid = jwt.verify(oldToken, env.jwtSecret).sid;

    const switchResponse = await request(app)
      .post("/api/auth/switch-role")
      .set("Authorization", `Bearer ${oldToken}`)
      .send({ role: ROLES.REVIEWER })
      .expect(200);

    const newToken = switchResponse.body.token;
    const newSid = jwt.verify(newToken, env.jwtSecret).sid;

    expect(newSid).not.toBe(oldSid);
    expect(sessionRepository.__active.has(oldSid)).toBe(false);
    expect(sessionRepository.__active.has(newSid)).toBe(true);

    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`)
      .expect(401);

    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${newToken}`)
      .expect(200);
  });

  test("a token issued without a sid (legacy) is rejected as INVALID_TOKEN", async () => {
    const legacyToken = jwt.sign({ email: user.email, actingRole: ROLES.AUTHOR }, env.jwtSecret, {
      subject: user.id,
      expiresIn: "1h"
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${legacyToken}`)
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  test("cross-tenant: user A logging out does not revoke user B's session", async () => {
    const userB = {
      id: "user-2",
      email: "reviewer@example.com",
      name: "Demo Reviewer",
      mfaEnabled: true,
      passwordHash: bcrypt.hashSync("VantageDemo123!", 4),
      roleAssignments: [
        { role: ROLES.REVIEWER, facilityId: "facility-2", operatorId: "operator-2" }
      ],
      roles: [ROLES.REVIEWER],
      facilities: [{ id: "facility-2", name: "Other Facility", operatorId: "operator-2" }]
    };

    userRepository.findUserByEmail.mockImplementation(async (email) => {
      if (email === user.email) return user;
      if (email === userB.email) return userB;
      return null;
    });
    userRepository.findUserById.mockImplementation(async (id) => {
      if (id === user.id) return user;
      if (id === userB.id) return userB;
      return null;
    });

    const loginA = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);
    const loginB = await request(app)
      .post("/api/auth/login")
      .send({ email: userB.email, password: "VantageDemo123!" })
      .expect(200);

    const tokenA = loginA.body.token;
    const tokenB = loginB.body.token;
    const sidA = jwt.verify(tokenA, env.jwtSecret).sid;
    const sidB = jwt.verify(tokenB, env.jwtSecret).sid;

    expect(sidA).not.toBe(sidB);

    await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${tokenA}`).expect(204);

    expect(sessionRepository.__active.has(sidA)).toBe(false);
    expect(sessionRepository.__active.has(sidB)).toBe(true);

    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tokenB}`).expect(200);
  });
});
