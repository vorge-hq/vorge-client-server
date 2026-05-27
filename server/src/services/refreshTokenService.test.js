jest.mock("../db/knex", () => ({
  transaction: jest.fn(async (callback) => callback("trx"))
}));

jest.mock("../repositories/refreshTokenRepository", () => ({
  createRefreshToken: jest.fn(),
  findByHashForUpdate: jest.fn(),
  findActiveDescendantInFamily: jest.fn(),
  isFamilyRevoked: jest.fn(),
  markUsed: jest.fn(),
  revokeFamily: jest.fn(),
  revokeByHash: jest.fn(),
  cleanupExpired: jest.fn()
}));

jest.mock("./sessionService", () => ({
  rotateSession: jest.fn()
}));

const refreshTokenRepository = require("../repositories/refreshTokenRepository");
const sessionService = require("./sessionService");
const refreshTokenService = require("./refreshTokenService");

const user = {
  id: "user-1",
  email: "user@example.com",
  roleAssignments: [{ role: "Author", facilityId: "facility-1", operatorId: "operator-1" }]
};

const req = { ip: "10.0.0.1", headers: { "user-agent": "jest" } };

beforeEach(() => {
  jest.clearAllMocks();
  refreshTokenRepository.createRefreshToken.mockResolvedValue({ id: "rt-new" });
  refreshTokenRepository.markUsed.mockResolvedValue(1);
  refreshTokenRepository.revokeFamily.mockResolvedValue(1);
  refreshTokenRepository.isFamilyRevoked.mockResolvedValue(false);
  sessionService.rotateSession.mockResolvedValue({ sid: "new-sid", expiresAt: new Date(Date.now() + 900000) });
});

describe("refreshTokenService.issueInitial", () => {
  test("defaults to the module-level db when no trx is supplied", async () => {
    await refreshTokenService.issueInitial({ user, sessionId: "sid-1" });
    const [, trx] = refreshTokenRepository.createRefreshToken.mock.calls[0];
    expect(trx).toBeDefined();
  });

  test("creates a row with a fresh family and returns a plaintext token + future expiry", async () => {
    const result = await refreshTokenService.issueInitial({ user, sessionId: "sid-1" }, "trx");

    expect(result.plaintextToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 28 * 24 * 60 * 60 * 1000);
    expect(result.familyId).toEqual(expect.any(String));

    expect(refreshTokenRepository.createRefreshToken).toHaveBeenCalledTimes(1);
    const [payload, trx] = refreshTokenRepository.createRefreshToken.mock.calls[0];
    expect(payload).toMatchObject({
      tokenHash: refreshTokenService.hashToken(result.plaintextToken),
      familyId: result.familyId,
      parentId: null,
      userId: "user-1",
      sessionId: "sid-1"
    });
    expect(trx).toBe("trx");
  });
});

describe("refreshTokenService.rotate", () => {
  const activeRow = {
    id: "rt-1",
    tokenHash: "ignored",
    familyId: "fam-1",
    parentId: null,
    userId: "user-1",
    sessionId: "sid-1",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    usedAt: null,
    revokedAt: null
  };

  test("happy path: marks parent used, rotates session, creates child", async () => {
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(activeRow);

    const presented = "0".repeat(64);
    const result = await refreshTokenService.rotate(
      { presentedPlaintext: presented, user, actingRole: "Author", req },
      "trx"
    );

    expect(result.wasReuseWindow).toBe(false);
    expect(result.plaintextToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sessionId).toBe("new-sid");
    expect(result.familyId).toBe("fam-1");
    expect(result.previousSid).toBe("sid-1");

    expect(refreshTokenRepository.markUsed).toHaveBeenCalledWith("rt-1", expect.any(Date), "trx");
    expect(sessionService.rotateSession).toHaveBeenCalledWith({
      user,
      previousSid: "sid-1",
      actingRole: "Author",
      req,
      trx: "trx"
    });
    const [childPayload] = refreshTokenRepository.createRefreshToken.mock.calls[0];
    expect(childPayload).toMatchObject({
      familyId: "fam-1",
      parentId: "rt-1",
      userId: "user-1",
      sessionId: "new-sid"
    });
  });

  test("reuse window with existing descendant: returns descendant data, no new write", async () => {
    const usedRow = { ...activeRow, usedAt: new Date(Date.now() - 5000) };
    const descendant = {
      id: "rt-2",
      familyId: "fam-1",
      parentId: "rt-1",
      sessionId: "sid-descendant",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revokedAt: null
    };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(usedRow);
    refreshTokenRepository.findActiveDescendantInFamily.mockResolvedValue(descendant);

    const result = await refreshTokenService.rotate(
      { presentedPlaintext: "abc", user, actingRole: "Author", req },
      "trx"
    );

    expect(result.wasReuseWindow).toBe(true);
    expect(result.plaintextToken).toBeNull();
    expect(result.sessionId).toBe("sid-descendant");
    expect(refreshTokenRepository.markUsed).not.toHaveBeenCalled();
    expect(refreshTokenRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(sessionService.rotateSession).not.toHaveBeenCalled();
  });

  test("reuse window with no descendant yet: falls through to normal rotation", async () => {
    const usedRow = { ...activeRow, usedAt: new Date(Date.now() - 1000) };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(usedRow);
    refreshTokenRepository.findActiveDescendantInFamily.mockResolvedValue(null);

    const result = await refreshTokenService.rotate(
      { presentedPlaintext: "abc", user, actingRole: "Author", req },
      "trx"
    );

    expect(result.wasReuseWindow).toBe(false);
    expect(refreshTokenRepository.markUsed).toHaveBeenCalled();
    expect(refreshTokenRepository.createRefreshToken).toHaveBeenCalled();
  });

  test("past reuse window: revokes family and throws replay error", async () => {
    const usedRow = { ...activeRow, usedAt: new Date(Date.now() - 60000) };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(usedRow);

    await expect(
      refreshTokenService.rotate(
        { presentedPlaintext: "abc", user, actingRole: "Author", req },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", replayDetected: true });

    expect(refreshTokenRepository.revokeFamily).toHaveBeenCalledWith("fam-1", expect.any(Date), "trx");
    expect(refreshTokenRepository.markUsed).not.toHaveBeenCalled();
  });

  test("expired token: throws INVALID_REFRESH_TOKEN without replay flag", async () => {
    const expiredRow = { ...activeRow, expiresAt: new Date(Date.now() - 1000) };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(expiredRow);

    await expect(
      refreshTokenService.rotate(
        { presentedPlaintext: "abc", user, actingRole: "Author", req },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", replayDetected: false });

    expect(refreshTokenRepository.revokeFamily).not.toHaveBeenCalled();
  });

  test("already-revoked token: throws with replay flag (suspicious)", async () => {
    const revokedRow = { ...activeRow, revokedAt: new Date() };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(revokedRow);

    await expect(
      refreshTokenService.rotate(
        { presentedPlaintext: "abc", user, actingRole: "Author", req },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", replayDetected: true });
  });

  test("token from a family that is already revoked: throws with replay flag", async () => {
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(activeRow);
    refreshTokenRepository.isFamilyRevoked.mockResolvedValueOnce(true);

    await expect(
      refreshTokenService.rotate(
        { presentedPlaintext: "abc", user, actingRole: "Author", req },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", replayDetected: true });
  });

  test("unknown token: throws INVALID_REFRESH_TOKEN without replay flag", async () => {
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(null);

    await expect(
      refreshTokenService.rotate(
        { presentedPlaintext: "abc", user, actingRole: "Author", req },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", replayDetected: false });
  });

  test("missing token: throws INVALID_REFRESH_TOKEN", async () => {
    await expect(
      refreshTokenService.rotate({ presentedPlaintext: null, user, actingRole: "Author", req }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
  });

  test("missing trx: throws programmer error (not a domain error)", async () => {
    await expect(
      refreshTokenService.rotate({ presentedPlaintext: "abc", user, actingRole: "Author", req }, undefined)
    ).rejects.toThrow("db.transaction");
  });
});

describe("refreshTokenService.revokeFamilyByToken", () => {
  test("revokes all rows in the family", async () => {
    const row = { id: "rt-1", familyId: "fam-1" };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(row);
    refreshTokenRepository.revokeFamily.mockResolvedValue(3);

    const result = await refreshTokenService.revokeFamilyByToken("abc", new Date(), "trx");

    expect(result).toEqual({ revokedCount: 3, familyId: "fam-1" });
    expect(refreshTokenRepository.revokeFamily).toHaveBeenCalledWith(
      "fam-1",
      expect.any(Date),
      "trx"
    );
  });

  test("unknown token: no-op (revokedCount 0, familyId null)", async () => {
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(null);

    const result = await refreshTokenService.revokeFamilyByToken("abc", new Date(), "trx");

    expect(result).toEqual({ revokedCount: 0, familyId: null });
    expect(refreshTokenRepository.revokeFamily).not.toHaveBeenCalled();
  });

  test("missing token or missing trx: no-op", async () => {
    await expect(refreshTokenService.revokeFamilyByToken(null, new Date(), "trx")).resolves.toEqual({
      revokedCount: 0,
      familyId: null
    });
    await expect(refreshTokenService.revokeFamilyByToken("abc", new Date(), undefined)).resolves.toEqual({
      revokedCount: 0,
      familyId: null
    });
  });

  test("defaults `now` to current time when omitted", async () => {
    const row = { id: "rt-1", familyId: "fam-1" };
    refreshTokenRepository.findByHashForUpdate.mockResolvedValue(row);
    refreshTokenRepository.revokeFamily.mockResolvedValue(1);

    await refreshTokenService.revokeFamilyByToken("abc", undefined, "trx");

    const [, now] = refreshTokenRepository.revokeFamily.mock.calls[0];
    expect(now).toBeInstanceOf(Date);
  });
});

describe("refreshTokenService helpers", () => {
  test("generatePlaintextToken returns 64 hex chars and is non-deterministic", () => {
    const a = refreshTokenService.generatePlaintextToken();
    const b = refreshTokenService.generatePlaintextToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  test("hashToken is deterministic sha256 hex", () => {
    const value = "deadbeef";
    expect(refreshTokenService.hashToken(value)).toBe(refreshTokenService.hashToken(value));
    expect(refreshTokenService.hashToken(value)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("computeExpiresAt is approximately 30 days from now", () => {
    const expiresAt = refreshTokenService.computeExpiresAt();
    const ms = expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(29.9 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(30.1 * 24 * 60 * 60 * 1000);
  });
});
