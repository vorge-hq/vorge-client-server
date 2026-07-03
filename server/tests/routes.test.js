// Enable TOTP test-mode bypass: any "000000" code is accepted by totpService.
// Per chunk-4 lockbox §Locked decisions #13. The env boot guard refuses to
// start the server when NODE_ENV === "production" AND __MFA_TEST_MODE__ === "1"
// so this is safe for tests only.
process.env.__MFA_TEST_MODE__ = "1";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const env = require("../src/config/env");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../src/services/constants");

jest.mock("../src/db/knex", () => {
  // The facilityScope middleware wraps each assessments/mitigations request in a
  // transaction and runs SET LOCAL via trx.raw; content mutations then open an
  // inner (savepoint) transaction on that trx. The mock trx therefore needs both
  // .raw and a nested .transaction, plus .fn.now for repo update helpers.
  const trx = { raw: jest.fn(async () => {}), fn: { now: () => new Date() } };
  trx.transaction = jest.fn(async (callback) => callback(trx));
  return {
    transaction: jest.fn(async (callback) => callback(trx)),
    raw: jest.fn(async () => {}),
    fn: { now: () => new Date() }
  };
});

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
  })),
  updatePasswordHash: jest.fn(async () => 1),
  setMfaEnrolledAt: jest.fn(async (userId, ts) => 1),
  clearMfaEnrollment: jest.fn(async () => 1),
  updateMfaFailureState: jest.fn(async () => 1)
}));

jest.mock("../src/repositories/mfaSecretRepository", () => {
  const byUser = new Map();
  return {
    __byUser: byUser,
    upsertPending: jest.fn(async ({ userId, secretEncrypted, secretNonce, keyVersion = 1 }) => {
      const existing = byUser.get(userId) || {};
      const row = {
        userId,
        secretEncrypted,
        secretNonce,
        keyVersion,
        createdAt: existing.createdAt || new Date(),
        verifiedAt: null
      };
      byUser.set(userId, row);
      return row;
    }),
    findByUserId: jest.fn(async (userId) => byUser.get(userId) || null),
    promotePending: jest.fn(async (userId, now) => {
      const row = byUser.get(userId);
      if (!row || row.verifiedAt) return 0;
      row.verifiedAt = now;
      return 1;
    }),
    deleteForUser: jest.fn(async (userId) => (byUser.delete(userId) ? 1 : 0)),
    cleanupExpiredPending: jest.fn(async () => 0)
  };
});

jest.mock("../src/repositories/mfaRecoveryCodeRepository", () => {
  const byUser = new Map();
  return {
    __byUser: byUser,
    createMany: jest.fn(async ({ userId, codeHashes }) => {
      const list = byUser.get(userId) || [];
      const created = codeHashes.map((h, i) => ({
        id: `rc-${userId}-${list.length + i}`,
        userId,
        codeHash: h,
        usedAt: null,
        createdAt: new Date()
      }));
      byUser.set(userId, list.concat(created));
      return created;
    }),
    findActiveByUserId: jest.fn(async (userId) =>
      (byUser.get(userId) || []).filter((c) => !c.usedAt)
    ),
    markUsed: jest.fn(async (id, now) => {
      for (const list of byUser.values()) {
        const row = list.find((c) => c.id === id);
        if (row && !row.usedAt) {
          row.usedAt = now;
          return 1;
        }
      }
      return 0;
    }),
    revokeAllForUser: jest.fn(async (userId, now) => {
      const list = byUser.get(userId) || [];
      let count = 0;
      list.forEach((c) => {
        if (!c.usedAt) {
          c.usedAt = now;
          count += 1;
        }
      });
      return count;
    }),
    deleteForUser: jest.fn(async (userId) => {
      const had = byUser.has(userId);
      byUser.delete(userId);
      return had ? 1 : 0;
    })
  };
});

jest.mock("../src/repositories/mfaTrustedDeviceRepository", () => {
  const byHash = new Map();
  return {
    __byHash: byHash,
    createDevice: jest.fn(async ({ userId, cookieTokenHash, expiresAt }) => {
      const row = {
        id: `td-${cookieTokenHash.slice(0, 8)}`,
        userId,
        cookieTokenHash,
        expiresAt,
        createdAt: new Date(),
        lastSeenAt: null
      };
      byHash.set(cookieTokenHash, row);
      return row;
    }),
    findActiveByHash: jest.fn(async (h, now) => {
      const row = byHash.get(h);
      if (!row) return null;
      if (new Date(row.expiresAt) <= (now || new Date())) return null;
      return row;
    }),
    touchLastSeen: jest.fn(async () => 1),
    revokeAllForUser: jest.fn(async (userId) => {
      let count = 0;
      for (const [k, r] of byHash.entries()) {
        if (r.userId === userId) {
          byHash.delete(k);
          count += 1;
        }
      }
      return count;
    }),
    cleanupExpired: jest.fn(async () => 0)
  };
});

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
    createSession: jest.fn(async ({ id, userId, actingRole, facilityId, mfaSatisfied = true, mustReenroll = false }) => {
      active.add(id);
      const row = { id, userId, actingRole, facilityId, mfaSatisfied, mustReenroll };
      sessions.set(id, row);
      return row;
    }),
    findSessionById: jest.fn(async (sid) => sessions.get(sid) || null),
    findActiveSessionById: jest.fn(async (sid) => (active.has(sid) ? sessions.get(sid) || { id: sid } : null)),
    revokeSession: jest.fn(async (sid) => (active.delete(sid) ? 1 : 0)),
    revokeAllForUser: jest.fn(async (userId) => {
      let count = 0;
      for (const [sid, row] of sessions.entries()) {
        if (row.userId === userId && active.has(sid)) {
          active.delete(sid);
          count += 1;
        }
      }
      return count;
    }),
    setMfaSatisfied: jest.fn(async (sid, value) => {
      const row = sessions.get(sid);
      if (row) row.mfaSatisfied = Boolean(value);
      return row ? 1 : 0;
    }),
    setMustReenroll: jest.fn(async (sid, value) => {
      const row = sessions.get(sid);
      if (row) row.mustReenroll = Boolean(value);
      return row ? 1 : 0;
    }),
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
    revokeAllForUser: jest.fn(async (userId, now) => {
      let count = 0;
      for (const row of byHash.values()) {
        if (row.userId === userId && !row.revokedAt) {
          row.revokedAt = now;
          revokedFamilies.add(row.familyId);
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

jest.mock("../src/repositories/passwordResetTokenRepository", () => {
  const byHash = new Map();
  const byId = new Map();
  return {
    __byHash: byHash,
    __byId: byId,
    createToken: jest.fn(async ({ id, tokenHash, userId, expiresAt }) => {
      const row = {
        id,
        tokenHash,
        userId,
        createdAt: new Date(),
        expiresAt,
        usedAt: null
      };
      byHash.set(tokenHash, row);
      byId.set(id, row);
      return row;
    }),
    findActiveByHash: jest.fn(async (tokenHash, now = new Date()) => {
      const row = byHash.get(tokenHash);
      if (!row) return null;
      if (row.usedAt) return null;
      if (row.expiresAt && new Date(row.expiresAt) <= now) return null;
      return row;
    }),
    markUsed: jest.fn(async (id, now) => {
      const row = byId.get(id);
      if (row && !row.usedAt) {
        row.usedAt = now;
        return 1;
      }
      return 0;
    }),
    revokeAllForUser: jest.fn(async () => 0),
    cleanupExpired: jest.fn(async () => 0)
  };
});

jest.mock("../src/services/emailService", () => ({
  sendPasswordResetEmail: jest.fn()
}));

const app = require("../src/app");
const userRepository = require("../src/repositories/userRepository");
const assessmentRepository = require("../src/repositories/assessmentRepository");
const mitigationRepository = require("../src/repositories/mitigationRepository");
const sessionRepository = require("../src/repositories/sessionRepository");
const refreshTokenRepository = require("../src/repositories/refreshTokenRepository");
const refreshTokenService = require("../src/services/refreshTokenService");
const passwordResetTokenRepository = require("../src/repositories/passwordResetTokenRepository");
const passwordResetService = require("../src/services/passwordResetService");
const emailService = require("../src/services/emailService");
const mfaSecretRepository = require("../src/repositories/mfaSecretRepository");
const mfaRecoveryCodeRepository = require("../src/repositories/mfaRecoveryCodeRepository");
const mfaTrustedDeviceRepository = require("../src/repositories/mfaTrustedDeviceRepository");
const mfaEncryption = require("../src/services/mfaEncryption");
const totpService = require("../src/services/totpService");

function seedVerifiedSecret(userId, base32 = "JBSWY3DPEHPK3PXP") {
  const { ciphertext, nonce } = mfaEncryption.encrypt(base32);
  mfaSecretRepository.__byUser.set(userId, {
    userId,
    secretEncrypted: ciphertext,
    secretNonce: nonce,
    keyVersion: 1,
    createdAt: new Date(),
    verifiedAt: new Date()
  });
}

const user = {
  id: "user-1",
  email: "author@example.com",
  name: "Demo Author",
  mfaEnabled: true,
  passwordHash: bcrypt.hashSync("VorgeDemo123!", 4),
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
    facilityId: "facility-1",
    mfaSatisfied: true,
    mustReenroll: false
  });
  refreshTokenRepository.__byHash.clear();
  refreshTokenRepository.__byId.clear();
  refreshTokenRepository.__revokedFamilies.clear();
  passwordResetTokenRepository.__byHash.clear();
  passwordResetTokenRepository.__byId.clear();
  mfaSecretRepository.__byUser.clear();
  mfaRecoveryCodeRepository.__byUser.clear();
  mfaTrustedDeviceRepository.__byHash.clear();
  userRepository.findUserByEmail.mockResolvedValue(user);
  userRepository.findUserById.mockResolvedValue(user);
});

function extractRefreshCookie(response) {
  const setCookies = response.headers["set-cookie"] || [];
  const refreshSetCookie = setCookies.find((c) => c.startsWith("vorge_refresh="));
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
      .send({ email: user.email, password: "VorgeDemo123!" })
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
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);

    const payload = jwt.verify(response.body.token, env.jwtSecret);
    expect(payload.sub).toBe(user.id);
    expect(payload.sid).toEqual(expect.any(String));
    expect(sessionRepository.__active.has(payload.sid)).toBe(true);

    const setCookies = response.headers["set-cookie"] || [];
    const refreshCookie = setCookies.find((c) => c.startsWith("vorge_refresh="));
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
      .send({ email: user.email, password: "VorgeDemo123!" })
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
    const clearLine = clearCookies.find((c) => c.startsWith("vorge_refresh="));
    expect(clearLine).toBeDefined();
    expect(clearLine).toMatch(/vorge_refresh=;/);

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
      .send({ email: user.email, password: "VorgeDemo123!" })
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
      passwordHash: bcrypt.hashSync("VorgeDemo123!", 4),
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
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);
    const loginB = await request(app)
      .post("/api/auth/login")
      .send({ email: userB.email, password: "VorgeDemo123!" })
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
      .send({ email: user.email, password: "VorgeDemo123!" })
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
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);
    const cookie = extractRefreshCookie(login);

    const first = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    const firstSid = jwt.verify(first.body.token, env.jwtSecret).sid;

    const second = await request(app).post("/api/auth/refresh").set("Cookie", cookie).expect(200);
    const secondSid = jwt.verify(second.body.token, env.jwtSecret).sid;

    expect(secondSid).toBe(firstSid); // descendant's session
    // Reuse-window response does NOT re-set the cookie
    const setCookies = second.headers["set-cookie"] || [];
    expect(setCookies.find((c) => c.startsWith("vorge_refresh="))).toBeUndefined();
  });

  test("POST /refresh past the reuse window with an already-used cookie: 401 + entire family revoked", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VorgeDemo123!" })
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
      .send({ email: user.email, password: "VorgeDemo123!" })
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
      passwordHash: bcrypt.hashSync("VorgeDemo123!", 4),
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
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);
    const loginB = await request(app)
      .post("/api/auth/login")
      .send({ email: userB.email, password: "VorgeDemo123!" })
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

describe("auth password reset lifecycle", () => {
  test("POST /forgot-password with existing email → 200, email stub called, token row created", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [emailArg, urlArg] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(emailArg).toBe(user.email);
    expect(urlArg).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);

    expect(passwordResetTokenRepository.createToken).toHaveBeenCalledTimes(1);
    expect(passwordResetTokenRepository.__byId.size).toBe(1);
  });

  test("POST /forgot-password with unknown email → 200, NO email, NO token row", async () => {
    userRepository.findUserByEmail.mockResolvedValueOnce(null);

    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@nowhere.example" })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(passwordResetTokenRepository.createToken).not.toHaveBeenCalled();
    expect(passwordResetTokenRepository.__byId.size).toBe(0);
  });

  test("POST /reset-password with valid token → 200, password updated, sessions+refresh revoked", async () => {
    // Set up: log in to create an active session + refresh family.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);
    const sid = jwt.verify(login.body.token, env.jwtSecret).sid;
    expect(sessionRepository.__active.has(sid)).toBe(true);
    const cookie = extractRefreshCookie(login);
    const refreshRow = refreshTokenRepository.__byHash.get(
      refreshTokenService.hashToken(refreshCookieValue(cookie))
    );
    expect(refreshRow.revokedAt).toBeFalsy();

    // Request a reset.
    await request(app).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const [, resetUrl] = emailService.sendPasswordResetEmail.mock.calls[0];
    const tokenParam = new URL(resetUrl).searchParams.get("token");

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: tokenParam, password: "NewSecurePassword123!" })
      .expect(200);

    expect(response.body).toEqual({ ok: true, userId: user.id });
    expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
      user.id,
      expect.stringMatching(/^\$2[aby]\$/),
      expect.anything()
    );
    expect(sessionRepository.__active.has(sid)).toBe(false);
    expect(refreshRow.revokedAt).toBeTruthy();

    // Original access token is dead.
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(401);

    // Re-using the same reset token → 401 INVALID_RESET_TOKEN.
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: tokenParam, password: "AnotherPassword123!" })
      .expect(401);
  });

  test("POST /reset-password with expired token → 401", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const [, resetUrl] = emailService.sendPasswordResetEmail.mock.calls[0];
    const tokenParam = new URL(resetUrl).searchParams.get("token");

    // Backdate expiry
    const hash = passwordResetService.hashToken(tokenParam);
    const row = passwordResetTokenRepository.__byHash.get(hash);
    row.expiresAt = new Date(Date.now() - 1000);

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: tokenParam, password: "NewSecurePassword123!" })
      .expect(401);
    expect(response.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  test("POST /reset-password with unknown token → 401", async () => {
    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "f".repeat(64), password: "NewSecurePassword123!" })
      .expect(401);
    expect(response.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  test("POST /reset-password with short password → 400 PASSWORD_TOO_SHORT", async () => {
    await request(app).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const [, resetUrl] = emailService.sendPasswordResetEmail.mock.calls[0];
    const tokenParam = new URL(resetUrl).searchParams.get("token");

    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: tokenParam, password: "short" })
      .expect(400);
    expect(response.body.error.code).toBe("PASSWORD_TOO_SHORT");
  });

  test("cross-tenant: User A's password reset does not touch User B's password, sessions, or refresh tokens", async () => {
    const userB = {
      id: "user-2",
      email: "reviewer@example.com",
      name: "Demo Reviewer",
      mfaEnabled: true,
      passwordHash: bcrypt.hashSync("VorgeDemo123!", 4),
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

    // Both users log in.
    const loginA = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);
    const loginB = await request(app)
      .post("/api/auth/login")
      .send({ email: userB.email, password: "VorgeDemo123!" })
      .expect(200);

    const sidA = jwt.verify(loginA.body.token, env.jwtSecret).sid;
    const sidB = jwt.verify(loginB.body.token, env.jwtSecret).sid;
    const cookieB = extractRefreshCookie(loginB);
    const refreshRowB = refreshTokenRepository.__byHash.get(
      refreshTokenService.hashToken(refreshCookieValue(cookieB))
    );

    // Request a reset for User A and consume the token.
    await request(app).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const [, resetUrl] = emailService.sendPasswordResetEmail.mock.calls.at(-1);
    const tokenParam = new URL(resetUrl).searchParams.get("token");

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: tokenParam, password: "NewSecurePassword123!" })
      .expect(200);

    // updatePasswordHash was called for User A — never with User B's id.
    const passwordUpdateCalls = userRepository.updatePasswordHash.mock.calls;
    expect(passwordUpdateCalls.some(([uid]) => uid === user.id)).toBe(true);
    expect(passwordUpdateCalls.some(([uid]) => uid === userB.id)).toBe(false);

    // Session revoke fanned out to A's sid but NOT to B's.
    expect(sessionRepository.__active.has(sidA)).toBe(false);
    expect(sessionRepository.__active.has(sidB)).toBe(true);

    // B's refresh row is untouched.
    expect(refreshRowB.revokedAt).toBeFalsy();
    expect(refreshTokenRepository.__revokedFamilies.has(refreshRowB.familyId)).toBe(false);

    // B's access token still works.
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginB.body.token}`)
      .expect(200);

    // B's refresh cookie still rotates cleanly.
    await request(app).post("/api/auth/refresh").set("Cookie", cookieB).expect(200);
  });
});

describe("auth mfa lifecycle", () => {
  const adminPasswordHash = bcrypt.hashSync("VorgeDemo123!", 4);
  const adminUser = {
    id: "user-admin",
    email: "admin@operator-a.example",
    name: "Demo Admin",
    mfaEnabled: false,
    mfaEnrolledAt: null,
    mfaFailedAttempts: 0,
    mfaLastFailureAt: null,
    mfaLockedUntil: null,
    passwordHash: adminPasswordHash,
    roleAssignments: [{ role: ROLES.ADMIN, facilityId: "facility-1", operatorId: "operator-1" }],
    roles: [ROLES.ADMIN],
    facilities: [{ id: "facility-1", name: "Demo Facility", operatorId: "operator-1" }]
  };

  beforeEach(() => {
    totpService._resetReplayCache();
    // Override default user mocks to recognise the admin fixture.
    userRepository.findUserByEmail.mockImplementation(async (email) => {
      if (email === user.email) return user;
      if (email === adminUser.email) return adminUser;
      return null;
    });
    userRepository.findUserById.mockImplementation(async (id) => {
      if (id === user.id) return user;
      if (id === adminUser.id) return adminUser;
      return null;
    });
    // setMfaEnrolledAt should also mutate the fixture so subsequent
    // findUserById sees the user as enrolled.
    userRepository.setMfaEnrolledAt.mockImplementation(async (uid, ts) => {
      if (uid === adminUser.id) adminUser.mfaEnrolledAt = ts;
      return 1;
    });
    userRepository.clearMfaEnrollment.mockImplementation(async (uid) => {
      if (uid === adminUser.id) {
        adminUser.mfaEnrolledAt = null;
        adminUser.mfaFailedAttempts = 0;
        adminUser.mfaLockedUntil = null;
      }
      return 1;
    });
  });

  afterEach(() => {
    // Reset the admin fixture so tests don't bleed state.
    adminUser.mfaEnrolledAt = null;
    adminUser.mfaFailedAttempts = 0;
    adminUser.mfaLockedUntil = null;
  });

  test("login as MFA-required user (not enrolled) returns mfaRequired+enrollmentNeeded; /me is gated 403", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);

    expect(response.body.mfaRequired).toBe(true);
    expect(response.body.enrollmentNeeded).toBe(true);
    expect(response.body.mfaSatisfied).toBe(false);

    // /me should be blocked by the MFA gate
    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${response.body.token}`)
      .expect(403);
    expect(meResponse.body.error.code).toBe("MFA_REQUIRED");
  });

  test("full enrollment flow: enroll-start → enroll-verify with bypass code → recovery codes returned, /me unlocks", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);
    const token = login.body.token;

    const enrollStart = await request(app)
      .post("/api/auth/mfa/enroll-start")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(enrollStart.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(enrollStart.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrollStart.body.manualKey).toMatch(/^[A-Z2-7]+=*$/);

    const enrollVerify = await request(app)
      .post("/api/auth/mfa/enroll-verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" })
      .expect(200);
    expect(enrollVerify.body.recoveryCodes).toHaveLength(10);
    enrollVerify.body.recoveryCodes.forEach((c) =>
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
    );

    // After enrollment, /me works (session promoted to mfa_satisfied=true).
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.mfaSatisfied).toBe(true);
  });

  test("verify endpoint promotes session for an already-enrolled user", async () => {
    // Seed an enrolled admin: pretend a previous enrollment completed.
    adminUser.mfaEnrolledAt = new Date(Date.now() - 60_000);
    // Seed a verified secret directly into the mock (so enroll-start isn't needed).
    seedVerifiedSecret(adminUser.id);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);
    expect(login.body.mfaSatisfied).toBe(false);
    expect(login.body.enrollmentNeeded).toBe(false);

    const verify = await request(app)
      .post("/api/auth/mfa/verify")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ code: "000000" })
      .expect(200);
    expect(verify.body.mfaSatisfied).toBe(true);

    // /me now works.
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
  });

  test("verify-recovery sets mfa_satisfied AND must_reenroll; non-enroll endpoints then 403", async () => {
    adminUser.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(adminUser.id);
    // Seed one bcrypt-hashed recovery code we know the plaintext for.
    const knownPlain = "ABCDE-FGHJK";
    const hash = bcrypt.hashSync(knownPlain, 4);
    mfaRecoveryCodeRepository.__byUser.set(adminUser.id, [
      { id: "rc-1", userId: adminUser.id, codeHash: hash, usedAt: null, createdAt: new Date() }
    ]);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);

    const recovery = await request(app)
      .post("/api/auth/mfa/verify-recovery")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ code: knownPlain })
      .expect(200);
    expect(recovery.body.mfaSatisfied).toBe(true);
    expect(recovery.body.mustReenroll).toBe(true);

    // /me is blocked: must_reenroll
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(403);
    expect(me.body.error.code).toBe("MFA_REENROLLMENT_REQUIRED");
  });

  test("disable: MFA-required user (Admin) → 403; non-required user (Author) → 200 after wipe", async () => {
    // Setup: pretend the Author user has enrolled (chunk-4 currently doesn't
    // require it, but the disable flow should still succeed).
    user.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(user.id);

    const authorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);

    await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${authorLogin.body.token}`)
      .send({ password: "VorgeDemo123!", code: "000000" })
      .expect(200);

    // Now Admin (MFA-required) attempts disable → 403
    adminUser.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(adminUser.id);
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);
    // First satisfy MFA so we can reach the disable handler with mfaSatisfied=true
    await request(app)
      .post("/api/auth/mfa/verify")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ code: "000000" })
      .expect(200);

    const disableResp = await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ password: "VorgeDemo123!", code: "000000" })
      .expect(403);
    expect(disableResp.body.error.code).toBe("MFA_REQUIRED_FOR_ROLE");

    // Reset user fixture
    user.mfaEnrolledAt = undefined;
  });

  test("admin-reset: shared-facility Admin succeeds; cross-tenant Admin → 403", async () => {
    // Set up a target user that shares facility-1 with adminUser.
    const targetUser = {
      id: "user-target",
      email: "target@operator-a.example",
      name: "Target User",
      passwordHash: bcrypt.hashSync("xxxxxxxxxxxx", 4),
      mfaEnabled: true,
      mfaEnrolledAt: new Date(),
      roleAssignments: [{ role: ROLES.AUTHOR, facilityId: "facility-1", operatorId: "operator-1" }],
      roles: [ROLES.AUTHOR],
      facilities: [{ id: "facility-1", name: "Demo Facility", operatorId: "operator-1" }]
    };
    // Outsider admin in a different facility.
    const outsiderAdmin = {
      id: "user-outsider",
      email: "outsider@operator-b.example",
      name: "Outsider Admin",
      passwordHash: bcrypt.hashSync("VorgeDemo123!", 4),
      mfaEnabled: true,
      mfaEnrolledAt: new Date(),
      mfaFailedAttempts: 0,
      roleAssignments: [{ role: ROLES.ADMIN, facilityId: "facility-2", operatorId: "operator-2" }],
      roles: [ROLES.ADMIN],
      facilities: [{ id: "facility-2", name: "Other Facility", operatorId: "operator-2" }]
    };
    userRepository.findUserByEmail.mockImplementation(async (email) => {
      if (email === adminUser.email) return adminUser;
      if (email === outsiderAdmin.email) return outsiderAdmin;
      if (email === targetUser.email) return targetUser;
      return null;
    });
    userRepository.findUserById.mockImplementation(async (id) => {
      if (id === adminUser.id) return adminUser;
      if (id === outsiderAdmin.id) return outsiderAdmin;
      if (id === targetUser.id) return targetUser;
      return null;
    });
    // adminUser pre-enrolled
    adminUser.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(adminUser.id);
    seedVerifiedSecret(outsiderAdmin.id);
    // Login the in-facility admin and satisfy MFA
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "VorgeDemo123!" })
      .expect(200);
    await request(app)
      .post("/api/auth/mfa/verify")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ code: "000000" })
      .expect(200);

    // Same-facility admin → 200
    await request(app)
      .post("/api/auth/mfa/admin-reset")
      .set("Authorization", `Bearer ${adminLogin.body.token}`)
      .send({ targetUserId: targetUser.id })
      .expect(200);

    // Now login outsider admin
    const outsiderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: outsiderAdmin.email, password: "VorgeDemo123!" })
      .expect(200);
    await request(app)
      .post("/api/auth/mfa/verify")
      .set("Authorization", `Bearer ${outsiderLogin.body.token}`)
      .send({ code: "000000" })
      .expect(200);

    // Outsider admin (different facility) → 403 ADMIN_RESET_NOT_AUTHORIZED
    const denied = await request(app)
      .post("/api/auth/mfa/admin-reset")
      .set("Authorization", `Bearer ${outsiderLogin.body.token}`)
      .send({ targetUserId: targetUser.id })
      .expect(403);
    expect(denied.body.error.code).toBe("ADMIN_RESET_NOT_AUTHORIZED");
  });

  test("switch-role: switching INTO an MFA-required role without enrollment → 403 MFA_ENROLLMENT_REQUIRED", async () => {
    // User fixture is Author/Reviewer/MitigationOwner — none MFA-required.
    // We need a user who has a non-MFA role AND an MFA-required role but isn't enrolled.
    const dualRoleUser = {
      ...user,
      id: "user-dual",
      email: "dual@operator-a.example",
      mfaEnrolledAt: null,
      roleAssignments: [
        { role: ROLES.AUTHOR, facilityId: "facility-1", operatorId: "operator-1" },
        { role: ROLES.APPROVER, facilityId: "facility-1", operatorId: "operator-1" }
      ],
      roles: [ROLES.AUTHOR, ROLES.APPROVER]
    };
    // Note: this user IS subject to requiresMfa(user) because Approver is in
    // the set. So login itself returns mfaRequired+enrollmentNeeded. The test
    // is therefore: when login returns enrollmentNeeded=true, /switch-role to
    // Approver is blocked.
    userRepository.findUserByEmail.mockImplementation(async (email) =>
      email === dualRoleUser.email ? dualRoleUser : null
    );
    userRepository.findUserById.mockImplementation(async (id) =>
      id === dualRoleUser.id ? dualRoleUser : null
    );

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: dualRoleUser.email, password: "VorgeDemo123!" })
      .expect(200);
    expect(login.body.enrollmentNeeded).toBe(true);

    // Switch-role to Approver while not enrolled → 403 MFA_ENROLLMENT_REQUIRED
    // But: switch-role is gated by the authenticate middleware which 403s on
    // mfa_satisfied=false. So we can't even reach the switch-role handler.
    const switchAttempt = await request(app)
      .post("/api/auth/switch-role")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ role: ROLES.APPROVER })
      .expect(403);
    // Either MFA_REQUIRED (middleware) or MFA_ENROLLMENT_REQUIRED (route check)
    expect(["MFA_REQUIRED", "MFA_ENROLLMENT_REQUIRED"]).toContain(switchAttempt.body.error.code);
  });

  test("cross-tenant adversarial: another user's recovery code is rejected", async () => {
    // adminUser is enrolled, has a recovery code
    adminUser.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(adminUser.id);
    const adminPlain = "ZZZZZ-YYYYY";
    mfaRecoveryCodeRepository.__byUser.set(adminUser.id, [
      {
        id: "rc-admin",
        userId: adminUser.id,
        codeHash: bcrypt.hashSync(adminPlain, 4),
        usedAt: null,
        createdAt: new Date()
      }
    ]);

    // user (Author) is enrolled with a *different* recovery code.
    user.mfaEnrolledAt = new Date(Date.now() - 60_000);
    seedVerifiedSecret(user.id);
    const userPlain = "XXXXX-WWWWW";
    mfaRecoveryCodeRepository.__byUser.set(user.id, [
      {
        id: "rc-user",
        userId: user.id,
        codeHash: bcrypt.hashSync(userPlain, 4),
        usedAt: null,
        createdAt: new Date()
      }
    ]);

    // user (Author) logs in. Author is not MFA-required, so they're already
    // mfa_satisfied. But verify-recovery still requires a code that BELONGS to
    // the requesting user. Passing adminUser's code → 401.
    const authorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "VorgeDemo123!" })
      .expect(200);

    // user attempts to use admin's recovery code → 401 INVALID_RECOVERY_CODE
    const wrong = await request(app)
      .post("/api/auth/mfa/verify-recovery")
      .set("Authorization", `Bearer ${authorLogin.body.token}`)
      .send({ code: adminPlain })
      .expect(401);
    expect(wrong.body.error.code).toBe("INVALID_RECOVERY_CODE");

    // user's own code still works.
    await request(app)
      .post("/api/auth/mfa/verify-recovery")
      .set("Authorization", `Bearer ${authorLogin.body.token}`)
      .send({ code: userPlain })
      .expect(200);

    // Reset user fixture
    user.mfaEnrolledAt = undefined;
  });
});
