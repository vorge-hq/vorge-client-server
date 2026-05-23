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
  const sessions = new Map();
  return {
    __active: active,
    __sessions: sessions,
    createSession: jest.fn(async ({ id, userId, actingRole, facilityId }) => {
      active.add(id);
      const row = { id, userId, actingRole, facilityId };
      sessions.set(id, row);
      return row;
    }),
    findSessionById: jest.fn(async (sid) => sessions.get(sid) || null),
    findActiveSessionById: jest.fn(async (sid) => (active.has(sid) ? sessions.get(sid) || { id: sid } : null)),
    revokeSession: jest.fn(async (sid) => (active.delete(sid) ? 1 : 0)),
    cleanupExpiredSessions: jest.fn(async () => 0)
  };
});

jest.mock("../src/repositories/refreshTokenRepository", () => {
  const byHash = new Map();
  const byId = new Map();
  const revokedFamilies = new Set();
  return {
    __byHash: byHash,
    __byId: byId,
    __revokedFamilies: revokedFamilies,
    createRefreshToken: jest.fn(async ({ id, tokenHash, familyId, parentId, userId, sessionId, expiresAt }) => {
      const row = {
        id,
        tokenHash,
        familyId,
        parentId: parentId || null,
        userId,
        sessionId,
        createdAt: new Date(),
        expiresAt,
        usedAt: null,
        revokedAt: null
      };
      byHash.set(tokenHash, row);
      byId.set(id, row);
      return row;
    }),
    findByHash: jest.fn(async (tokenHash) => byHash.get(tokenHash) || null),
    findByHashForUpdate: jest.fn(async (tokenHash) => byHash.get(tokenHash) || null),
    findActiveDescendantInFamily: jest.fn(async (familyId, parentId, now = new Date()) => {
      for (const row of byHash.values()) {
        if (
          row.familyId === familyId &&
          row.parentId === parentId &&
          !row.revokedAt &&
          new Date(row.expiresAt) > now
        ) {
          return row;
        }
      }
      return null;
    }),
    isFamilyRevoked: jest.fn(async (familyId) => revokedFamilies.has(familyId)),
    markUsed: jest.fn(async (id, now) => {
      const row = byId.get(id);
      if (row && !row.usedAt) {
        row.usedAt = now;
        return 1;
      }
      return 0;
    }),
    revokeFamily: jest.fn(async (familyId, now) => {
      revokedFamilies.add(familyId);
      let count = 0;
      for (const row of byHash.values()) {
        if (row.familyId === familyId && !row.revokedAt) {
          row.revokedAt = now;
          count++;
        }
      }
      return count;
    }),
    revokeByHash: jest.fn(async (tokenHash, now) => {
      const row = byHash.get(tokenHash);
      if (row && !row.revokedAt) {
        row.revokedAt = now;
        return 1;
      }
      return 0;
    }),
    cleanupExpired: jest.fn(async () => 0)
  };
});

const app = require("../src/app");
const userRepository = require("../src/repositories/userRepository");
const assessmentRepository = require("../src/repositories/assessmentRepository");
const mitigationRepository = require("../src/repositories/mitigationRepository");
const sessionRepository = require("../src/repositories/sessionRepository");
const refreshTokenRepository = require("../src/repositories/refreshTokenRepository");
const refreshTokenService = require("../src/services/refreshTokenService");

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
  sessionRepository.__sessions.clear();
  sessionRepository.__active.add("test-sid");
  sessionRepository.__sessions.set("test-sid", {
    id: "test-sid",
    userId: user.id,
    actingRole: ROLES.AUTHOR,
    facilityId: "facility-1"
  });
  refreshTokenRepository.__byHash.clear();
  refreshTokenRepository.__byId.clear();
  refreshTokenRepository.__revokedFamilies.clear();
  userRepository.findUserByEmail.mockResolvedValue(user);
  userRepository.findUserById.mockResolvedValue(user);
});

function extractRefreshCookie(response) {
  const setCookies = response.headers["set-cookie"] || [];
  const refreshSetCookie = setCookies.find((c) => c.startsWith("vantage_refresh="));
  if (!refreshSetCookie) return null;
  return refreshSetCookie.split(";")[0];
}

function refreshCookieValue(cookieHeader) {
  return cookieHeader.split("=")[1];
}

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
  test("login mints a token carrying both sub and sid claims and sets the refresh cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const payload = jwt.verify(response.body.token, env.jwtSecret);
    expect(payload.sub).toBe(user.id);
    expect(payload.sid).toEqual(expect.any(String));
    expect(sessionRepository.__active.has(payload.sid)).toBe(true);

    const setCookies = response.headers["set-cookie"] || [];
    const refreshCookie = setCookies.find((c) => c.startsWith("vantage_refresh="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/i);
    // Secure is omitted when NODE_ENV is not "production"
    expect(refreshCookie).not.toMatch(/Secure/i);

    const accessExp = payload.exp - payload.iat;
    expect(accessExp).toBe(900); // 15 min
  });

  test("logout revokes the session AND the refresh family; reusing the cookie post-logout fails", async () => {
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const token = loginResponse.body.token;
    const cookie = extractRefreshCookie(loginResponse);

    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(200);

    const logoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", cookie)
      .expect(204);

    // Server cleared the cookie
    const clearCookies = logoutResponse.headers["set-cookie"] || [];
    const clearLine = clearCookies.find((c) => c.startsWith("vantage_refresh="));
    expect(clearLine).toBeDefined();
    expect(clearLine).toMatch(/vantage_refresh=;/);

    // Access token replay → 401
    const meAfter = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    expect(meAfter.body.error.code).toBe("INVALID_TOKEN");

    // Re-use the refresh cookie → 401 INVALID_REFRESH_TOKEN (family revoked)
    const refreshAfter = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);
    expect(refreshAfter.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("switch-role rotates the session and the refresh token within the same family", async () => {
    const loginResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);

    const oldToken = loginResponse.body.token;
    const oldCookie = extractRefreshCookie(loginResponse);
    const oldSid = jwt.verify(oldToken, env.jwtSecret).sid;

    const oldRefreshRow = refreshTokenRepository.__byHash.get(
      refreshTokenService.hashToken(refreshCookieValue(oldCookie))
    );
    const familyId = oldRefreshRow.familyId;

    const switchResponse = await request(app)
      .post("/api/auth/switch-role")
      .set("Authorization", `Bearer ${oldToken}`)
      .set("Cookie", oldCookie)
      .send({ role: ROLES.REVIEWER })
      .expect(200);

    const newToken = switchResponse.body.token;
    const newCookie = extractRefreshCookie(switchResponse);
    const newSid = jwt.verify(newToken, env.jwtSecret).sid;

    expect(newSid).not.toBe(oldSid);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(oldCookie);

    const newRefreshRow = refreshTokenRepository.__byHash.get(
      refreshTokenService.hashToken(refreshCookieValue(newCookie))
    );
    expect(newRefreshRow.familyId).toBe(familyId);
    expect(newRefreshRow.parentId).toBe(oldRefreshRow.id);

    expect(sessionRepository.__active.has(oldSid)).toBe(false);
    expect(sessionRepository.__active.has(newSid)).toBe(true);

    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${oldToken}`).expect(401);
    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${newToken}`).expect(200);
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

  test("cross-tenant: user A logging out does not revoke user B's session or refresh family", async () => {
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
    const cookieA = extractRefreshCookie(loginA);
    const cookieB = extractRefreshCookie(loginB);
    const sidA = jwt.verify(tokenA, env.jwtSecret).sid;
    const sidB = jwt.verify(tokenB, env.jwtSecret).sid;

    expect(sidA).not.toBe(sidB);

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("Cookie", cookieA)
      .expect(204);

    expect(sessionRepository.__active.has(sidA)).toBe(false);
    expect(sessionRepository.__active.has(sidB)).toBe(true);

    await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tokenB}`).expect(200);

    // B's refresh cookie still rotates cleanly
    const refreshB = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookieB)
      .expect(200);
    expect(refreshB.body.token).toBeTruthy();
  });
});

describe("auth refresh-token lifecycle", () => {
  test("POST /refresh with no cookie → 401 MISSING_REFRESH_TOKEN", async () => {
    const response = await request(app).post("/api/auth/refresh").expect(401);
    expect(response.body.error.code).toBe("MISSING_REFRESH_TOKEN");
  });

  test("POST /refresh with valid cookie returns new access token and rotates the refresh cookie", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);
    const cookie = extractRefreshCookie(login);
    const oldSid = jwt.verify(login.body.token, env.jwtSecret).sid;

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);

    const newCookie = extractRefreshCookie(refresh);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);

    const newAccessPayload = jwt.verify(refresh.body.token, env.jwtSecret);
    expect(newAccessPayload.sid).not.toBe(oldSid);
    expect(newAccessPayload.sid).toEqual(expect.any(String));
    expect(sessionRepository.__active.has(oldSid)).toBe(false);
    expect(sessionRepository.__active.has(newAccessPayload.sid)).toBe(true);

    // New cookie works
    await request(app).post("/api/auth/refresh").set("Cookie", newCookie).expect(200);
  });

  test("POST /refresh twice with the SAME cookie within the reuse window: both succeed; second is reuse-window (no new cookie set)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);
    const cookie = extractRefreshCookie(login);

    const first = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    const firstSid = jwt.verify(first.body.token, env.jwtSecret).sid;

    const second = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    const secondSid = jwt.verify(second.body.token, env.jwtSecret).sid;

    expect(secondSid).toBe(firstSid); // descendant's session
    // Reuse-window response does NOT re-set the cookie
    const setCookies = second.headers["set-cookie"] || [];
    expect(setCookies.find((c) => c.startsWith("vantage_refresh="))).toBeUndefined();
  });

  test("POST /refresh past the reuse window with an already-used cookie: 401 + entire family revoked", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);
    const cookie = extractRefreshCookie(login);

    // First rotation marks the original token used
    const first = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    const newCookie = extractRefreshCookie(first);
    expect(newCookie).toBeDefined();

    // Backdate the original token's usedAt by 60s to simulate >30s elapsed
    const originalHash = refreshTokenService.hashToken(refreshCookieValue(cookie));
    const originalRow = refreshTokenRepository.__byHash.get(originalHash);
    originalRow.usedAt = new Date(Date.now() - 60 * 1000);

    const replay = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(401);
    expect(replay.body.error.code).toBe("INVALID_REFRESH_TOKEN");

    // Family is now revoked — the descendant cookie is also dead
    const familyId = originalRow.familyId;
    expect(refreshTokenRepository.__revokedFamilies.has(familyId)).toBe(true);

    const newCookieAfterReplay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", newCookie)
      .expect(401);
    expect(newCookieAfterReplay.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("POST /refresh after logout returns 401 (family already revoked)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VantageDemo123!" })
      .expect(200);
    const cookie = extractRefreshCookie(login);
    const token = login.body.token;

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", cookie)
      .expect(204);

    const response = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(401);
    expect(response.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("cross-tenant: replay-driven family revocation on User A does not touch User B's refresh family", async () => {
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

    const cookieA = extractRefreshCookie(loginA);
    const cookieB = extractRefreshCookie(loginB);

    const hashA = refreshTokenService.hashToken(refreshCookieValue(cookieA));
    const hashB = refreshTokenService.hashToken(refreshCookieValue(cookieB));
    const familyA = refreshTokenRepository.__byHash.get(hashA).familyId;
    const familyB = refreshTokenRepository.__byHash.get(hashB).familyId;
    expect(familyA).not.toBe(familyB);

    // Drive User A into the replay path: first rotation, then backdate, then replay.
    const rotateA = await request(app).post("/api/auth/refresh").set("Cookie", cookieA).expect(200);
    const newCookieA = extractRefreshCookie(rotateA);
    refreshTokenRepository.__byHash.get(hashA).usedAt = new Date(Date.now() - 60 * 1000);
    const replayA = await request(app).post("/api/auth/refresh").set("Cookie", cookieA).expect(401);
    expect(replayA.body.error.code).toBe("INVALID_REFRESH_TOKEN");

    // User A's family is revoked, both the original and the descendant.
    expect(refreshTokenRepository.__revokedFamilies.has(familyA)).toBe(true);
    await request(app).post("/api/auth/refresh").set("Cookie", newCookieA).expect(401);

    // User B's family is untouched.
    expect(refreshTokenRepository.__revokedFamilies.has(familyB)).toBe(false);
    const stillFineB = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookieB)
      .expect(200);
    expect(stillFineB.body.token).toBeTruthy();

    // And User B's access token still validates.
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${stillFineB.body.token}`)
      .expect(200);
  });
});
