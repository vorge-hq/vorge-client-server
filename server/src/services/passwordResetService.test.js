jest.mock("../db/knex", () => ({
  transaction: jest.fn(async (callback) => callback("trx"))
}));

jest.mock("../repositories/passwordResetTokenRepository", () => ({
  createToken: jest.fn(async () => ({ id: "rt-1" })),
  findActiveByHash: jest.fn(),
  markUsed: jest.fn(async () => 1),
  revokeAllForUser: jest.fn(async () => 0),
  cleanupExpired: jest.fn(async () => 0)
}));

jest.mock("../repositories/sessionRepository", () => ({
  revokeAllForUser: jest.fn(async () => 2)
}));

jest.mock("../repositories/refreshTokenRepository", () => ({
  revokeAllForUser: jest.fn(async () => 3)
}));

jest.mock("../repositories/userRepository", () => ({
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  updatePasswordHash: jest.fn(async () => 1)
}));

const passwordResetTokenRepository = require("../repositories/passwordResetTokenRepository");
const sessionRepository = require("../repositories/sessionRepository");
const refreshTokenRepository = require("../repositories/refreshTokenRepository");
const userRepository = require("../repositories/userRepository");
const passwordResetService = require("./passwordResetService");

const user = {
  id: "user-1",
  email: "adaeze@operator-a.example",
  passwordHash: "old-bcrypt-hash",
  roleAssignments: [{ role: "Author", facilityId: "facility-1" }]
};

const req = { ip: "10.0.0.1", headers: { "user-agent": "jest" } };

beforeEach(() => {
  jest.clearAllMocks();
  userRepository.findUserByEmail.mockResolvedValue(user);
  userRepository.findUserById.mockResolvedValue(user);
  passwordResetTokenRepository.findActiveByHash.mockResolvedValue({
    id: "rt-1",
    userId: user.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
});

describe("passwordResetService helpers", () => {
  test("generatePlaintextToken returns 64 hex chars and is non-deterministic", () => {
    const a = passwordResetService.generatePlaintextToken();
    const b = passwordResetService.generatePlaintextToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  test("hashToken is deterministic sha256 hex", () => {
    expect(passwordResetService.hashToken("abc")).toBe(passwordResetService.hashToken("abc"));
    expect(passwordResetService.hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("computeExpiresAt is approximately 1 hour from now", () => {
    const expiresAt = passwordResetService.computeExpiresAt();
    const ms = expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(59 * 60 * 1000);
    expect(ms).toBeLessThan(61 * 60 * 1000);
  });
});

describe("passwordResetService.requestReset", () => {
  test("existing user: returns plaintext token + reset URL; creates the row", async () => {
    const result = await passwordResetService.requestReset({ email: user.email, req }, "trx");

    expect(result.user).toBe(user);
    expect(result.plaintextToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.resetUrl).toContain("/reset-password?token=" + result.plaintextToken);
    expect(result.expiresAt).toBeInstanceOf(Date);

    const [createPayload, trx] = passwordResetTokenRepository.createToken.mock.calls[0];
    expect(createPayload).toMatchObject({
      tokenHash: passwordResetService.hashToken(result.plaintextToken),
      userId: user.id,
      sourceIp: "10.0.0.1",
      userAgent: "jest"
    });
    expect(trx).toBe("trx");
  });

  test("unknown email: returns null without writing", async () => {
    userRepository.findUserByEmail.mockResolvedValue(null);
    const result = await passwordResetService.requestReset({ email: "nobody@nowhere.example", req }, "trx");
    expect(result).toBeNull();
    expect(passwordResetTokenRepository.createToken).not.toHaveBeenCalled();
  });

  test("tolerates a request without ip/headers", async () => {
    await passwordResetService.requestReset({ email: user.email, req: {} }, "trx");
    const [payload] = passwordResetTokenRepository.createToken.mock.calls[0];
    expect(payload.sourceIp).toBeNull();
    expect(payload.userAgent).toBeNull();
  });

  test("defaults to module-level db when no trx is supplied", async () => {
    await passwordResetService.requestReset({ email: user.email, req });
    const [, trx] = passwordResetTokenRepository.createToken.mock.calls[0];
    expect(trx).toBeDefined();
  });
});

describe("passwordResetService.consumeToken", () => {
  test("happy path: updates password hash and marks token used", async () => {
    const validToken = "a".repeat(64);
    const result = await passwordResetService.consumeToken(
      { plaintextToken: validToken, newPassword: "x".repeat(12) },
      "trx"
    );

    expect(result).toBe(user);
    expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\$2[aby]\$/), // bcrypt prefix
      "trx"
    );
    expect(passwordResetTokenRepository.markUsed).toHaveBeenCalledWith(
      "rt-1",
      expect.any(Date),
      "trx"
    );
  });

  test("missing plaintext token: throws INVALID_RESET_TOKEN without other side effects", async () => {
    await expect(
      passwordResetService.consumeToken({ plaintextToken: null, newPassword: "x".repeat(12) }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN", status: 401 });
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(passwordResetTokenRepository.markUsed).not.toHaveBeenCalled();
  });

  test("short password: throws PASSWORD_TOO_SHORT (400)", async () => {
    await expect(
      passwordResetService.consumeToken({ plaintextToken: "a".repeat(64), newPassword: "short" }, "trx")
    ).rejects.toMatchObject({ code: "PASSWORD_TOO_SHORT", status: 400 });
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  test("missing password: throws PASSWORD_TOO_SHORT", async () => {
    await expect(
      passwordResetService.consumeToken({ plaintextToken: "a".repeat(64), newPassword: "" }, "trx")
    ).rejects.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  test("unknown / used / expired token (repo returns null): throws INVALID_RESET_TOKEN", async () => {
    passwordResetTokenRepository.findActiveByHash.mockResolvedValueOnce(null);
    await expect(
      passwordResetService.consumeToken(
        { plaintextToken: "a".repeat(64), newPassword: "x".repeat(12) },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  test("user no longer exists: throws INVALID_RESET_TOKEN", async () => {
    userRepository.findUserById.mockResolvedValueOnce(null);
    await expect(
      passwordResetService.consumeToken(
        { plaintextToken: "a".repeat(64), newPassword: "x".repeat(12) },
        "trx"
      )
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  test("atomicity: if updatePasswordHash fails, markUsed is NOT called (caller's trx rolls back)", async () => {
    userRepository.updatePasswordHash.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(
      passwordResetService.consumeToken(
        { plaintextToken: "a".repeat(64), newPassword: "x".repeat(12) },
        "trx"
      )
    ).rejects.toThrow("db unavailable");
    expect(passwordResetTokenRepository.markUsed).not.toHaveBeenCalled();
  });

  test("defaults to module-level db when no trx is supplied", async () => {
    await passwordResetService.consumeToken({
      plaintextToken: "a".repeat(64),
      newPassword: "x".repeat(12)
    });
    expect(userRepository.updatePasswordHash).toHaveBeenCalled();
  });
});

describe("passwordResetService.invalidateAllUserSessions", () => {
  test("revokes the user's sessions and refresh-token families", async () => {
    const result = await passwordResetService.invalidateAllUserSessions(
      { userId: "user-1" },
      "trx"
    );
    expect(result).toEqual({ sessionsRevoked: 2, refreshRevoked: 3 });
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      "trx"
    );
    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      "trx"
    );
  });

  test("defaults to module-level db when no trx is supplied", async () => {
    await passwordResetService.invalidateAllUserSessions({ userId: "user-1" });
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalled();
  });
});
