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

const app = require("../src/app");
const userRepository = require("../src/repositories/userRepository");
const assessmentRepository = require("../src/repositories/assessmentRepository");
const mitigationRepository = require("../src/repositories/mitigationRepository");

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

function tokenFor(actingRole = ROLES.AUTHOR) {
  return jwt.sign({ email: user.email, actingRole }, env.jwtSecret, { subject: user.id, expiresIn: "1h" });
}

beforeEach(() => {
  jest.clearAllMocks();
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
