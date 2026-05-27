jest.mock("../db/knex", () => ({ transaction: jest.fn(async (cb) => cb("trx")) }));

jest.mock("qrcode", () => ({
  toDataURL: jest.fn(async () => "data:image/png;base64,xxxx")
}));

jest.mock("./totpService", () => ({
  generateSecret: jest.fn(() => "JBSWY3DPEHPK3PXP"),
  buildOtpauthUrl: jest.fn(() => "otpauth://totp/test"),
  verifyCode: jest.fn(),
  isReplay: jest.fn(() => false),
  recordCodeUse: jest.fn(),
  isTestBypassActive: jest.fn(() => false)
}));

jest.mock("./mfaEncryption", () => ({
  encrypt: jest.fn(() => ({ ciphertext: Buffer.from("ct"), nonce: Buffer.alloc(12, 0) })),
  decrypt: jest.fn(() => "JBSWY3DPEHPK3PXP")
}));

jest.mock("./recoveryCodeService", () => ({
  generateCodes: jest.fn(async () => ({
    plaintexts: ["AAAAA-BBBBB", "CCCCC-DDDDD", "EEEEE-FFFFF"],
    hashes: ["h1", "h2", "h3"]
  })),
  findMatch: jest.fn()
}));

jest.mock("./mfaTrustDeviceService", () => ({
  issueCookie: jest.fn(async () => ({ plaintext: "x", tokenHash: "h", expiresAt: new Date() })),
  validateCookie: jest.fn(),
  clearCookie: jest.fn(),
  revokeAllForUser: jest.fn()
}));

jest.mock("../repositories/mfaSecretRepository", () => ({
  upsertPending: jest.fn(async () => ({})),
  findByUserId: jest.fn(),
  promotePending: jest.fn(async () => 1),
  deleteForUser: jest.fn(async () => 1)
}));

jest.mock("../repositories/mfaRecoveryCodeRepository", () => ({
  createMany: jest.fn(async () => []),
  findActiveByUserId: jest.fn(),
  markUsed: jest.fn(async () => 1),
  revokeAllForUser: jest.fn(async () => 0),
  deleteForUser: jest.fn(async () => 0)
}));

jest.mock("../repositories/mfaTrustedDeviceRepository", () => ({
  createDevice: jest.fn(),
  findActiveByHash: jest.fn(),
  touchLastSeen: jest.fn(),
  revokeAllForUser: jest.fn(async () => 0)
}));

jest.mock("../repositories/sessionRepository", () => ({
  setMfaSatisfied: jest.fn(async () => 1),
  setMustReenroll: jest.fn(async () => 1),
  revokeAllForUser: jest.fn(async () => 0)
}));

jest.mock("../repositories/userRepository", () => ({
  findUserById: jest.fn(),
  setMfaEnrolledAt: jest.fn(async () => 1),
  clearMfaEnrollment: jest.fn(async () => 1),
  updateMfaFailureState: jest.fn(async () => 1)
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn()
}));

const totpService = require("./totpService");
const recoveryCodeService = require("./recoveryCodeService");
const mfaSecretRepository = require("../repositories/mfaSecretRepository");
const mfaRecoveryCodeRepository = require("../repositories/mfaRecoveryCodeRepository");
const mfaTrustedDeviceRepository = require("../repositories/mfaTrustedDeviceRepository");
const sessionRepository = require("../repositories/sessionRepository");
const userRepository = require("../repositories/userRepository");
const trustDeviceService = require("./mfaTrustDeviceService");
const bcrypt = require("bcryptjs");
const mfaService = require("./mfaService");
const { ROLES } = require("./constants");

const user = {
  id: "user-1",
  email: "approver@example.com",
  passwordHash: "$2a$04$abcdefghijklmnopqrstuv",
  mfaFailedAttempts: 0,
  mfaLockedUntil: null,
  roleAssignments: [{ role: ROLES.AUTHOR, facilityId: "f-1" }]
};

beforeEach(() => {
  jest.clearAllMocks();
  totpService.verifyCode.mockReturnValue(0);
  totpService.isReplay.mockReturnValue(false);
});

describe("mfaService.enrollStart", () => {
  test("encrypts a fresh secret, upserts pending, and returns QR + manual key", async () => {
    const result = await mfaService.enrollStart({ user }, "trx");

    expect(result).toEqual({
      otpauthUrl: "otpauth://totp/test",
      qrDataUrl: "data:image/png;base64,xxxx",
      manualKey: "JBSWY3DPEHPK3PXP"
    });
    expect(mfaSecretRepository.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", keyVersion: 1 }),
      "trx"
    );
  });

  test("rejects missing user", async () => {
    await expect(mfaService.enrollStart({ user: null }, "trx")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS"
    });
  });
});

describe("mfaService.enrollVerify", () => {
  test("happy path: promotes pending, sets enrolled_at, returns recovery codes", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: null,
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });

    const result = await mfaService.enrollVerify({ user, code: "000000" }, "trx");

    expect(result.recoveryCodes).toHaveLength(3);
    expect(mfaSecretRepository.promotePending).toHaveBeenCalledWith("user-1", expect.any(Date), "trx");
    expect(userRepository.setMfaEnrolledAt).toHaveBeenCalledWith("user-1", expect.any(Date), "trx");
    expect(mfaRecoveryCodeRepository.deleteForUser).toHaveBeenCalledWith("user-1", "trx");
    expect(mfaRecoveryCodeRepository.createMany).toHaveBeenCalled();
  });

  test("no pending secret → MFA_NOT_ENROLLED", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue(null);
    await expect(mfaService.enrollVerify({ user, code: "000000" }, "trx")).rejects.toMatchObject({
      code: "MFA_NOT_ENROLLED"
    });
  });

  test("already verified → MFA_ENROLLMENT_PENDING (state collision)", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: new Date(),
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
    await expect(mfaService.enrollVerify({ user, code: "000000" }, "trx")).rejects.toMatchObject({
      code: "MFA_ENROLLMENT_PENDING"
    });
  });

  test("invalid code → INVALID_TOTP_CODE", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: null,
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
    totpService.verifyCode.mockReturnValue(null);
    await expect(mfaService.enrollVerify({ user, code: "999999" }, "trx")).rejects.toMatchObject({
      code: "INVALID_TOTP_CODE"
    });
  });
});

describe("mfaService.verifyTotp", () => {
  beforeEach(() => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: new Date(),
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
  });

  test("happy path: sets session mfa_satisfied=true, no trust cookie when not requested", async () => {
    const res = { cookie: jest.fn() };
    const result = await mfaService.verifyTotp(
      { user, sessionId: "sid-1", code: "000000", trustDevice: false, res },
      "trx"
    );
    expect(result.trustCookieIssued).toBe(false);
    expect(sessionRepository.setMfaSatisfied).toHaveBeenCalledWith("sid-1", true, "trx");
    expect(trustDeviceService.issueCookie).not.toHaveBeenCalled();
    expect(userRepository.updateMfaFailureState).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ failedAttempts: 0 }),
      "trx"
    );
  });

  test("trustDevice=true issues the cookie", async () => {
    const res = { cookie: jest.fn() };
    const result = await mfaService.verifyTotp(
      { user, sessionId: "sid-1", code: "000000", trustDevice: true, res },
      "trx"
    );
    expect(result.trustCookieIssued).toBe(true);
    expect(trustDeviceService.issueCookie).toHaveBeenCalledWith(res, "user-1", "trx");
  });

  test("user locked out → throws MFA_LOCKED_OUT immediately", async () => {
    const lockedUser = { ...user, mfaLockedUntil: new Date(Date.now() + 60000) };
    await expect(
      mfaService.verifyTotp({ user: lockedUser, sessionId: "sid-1", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_LOCKED_OUT" });
  });

  test("no verified secret → MFA_NOT_ENROLLED", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue(null);
    await expect(
      mfaService.verifyTotp({ user, sessionId: "sid-1", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_NOT_ENROLLED" });
  });

  test("replay detected → recorded as failure", async () => {
    totpService.isReplay.mockReturnValue(true);
    await expect(
      mfaService.verifyTotp({ user, sessionId: "sid-1", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
  });

  test("invalid code → failure recorded; below threshold returns INVALID_TOTP_CODE", async () => {
    totpService.verifyCode.mockReturnValue(null);
    await expect(
      mfaService.verifyTotp({ user, sessionId: "sid-1", code: "999999" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
    expect(userRepository.updateMfaFailureState).toHaveBeenCalled();
  });

  test("invalid code at lockout threshold → throws MFA_LOCKED_OUT", async () => {
    totpService.verifyCode.mockReturnValue(null);
    const closeToThreshold = { ...user, mfaFailedAttempts: 2 };
    await expect(
      mfaService.verifyTotp({ user: closeToThreshold, sessionId: "sid-1", code: "999999" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_LOCKED_OUT" });
  });
});

describe("mfaService.verifyRecovery", () => {
  test("happy path: marks code used, sets mfa_satisfied + must_reenroll", async () => {
    mfaRecoveryCodeRepository.findActiveByUserId.mockResolvedValue([
      { id: "rc-1", codeHash: "h1" },
      { id: "rc-2", codeHash: "h2" }
    ]);
    recoveryCodeService.findMatch.mockResolvedValue(1);

    const result = await mfaService.verifyRecovery(
      { user, sessionId: "sid-1", code: "AAAAA-BBBBB" },
      "trx"
    );

    expect(result.outcome).toBe("recovery");
    expect(mfaRecoveryCodeRepository.markUsed).toHaveBeenCalledWith("rc-2", expect.any(Date), "trx");
    expect(sessionRepository.setMfaSatisfied).toHaveBeenCalledWith("sid-1", true, "trx");
    expect(sessionRepository.setMustReenroll).toHaveBeenCalledWith("sid-1", true, "trx");
  });

  test("no codes left → INVALID_TOTP_CODE", async () => {
    mfaRecoveryCodeRepository.findActiveByUserId.mockResolvedValue([]);
    await expect(
      mfaService.verifyRecovery({ user, sessionId: "sid-1", code: "x" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
  });

  test("no match → INVALID_TOTP_CODE", async () => {
    mfaRecoveryCodeRepository.findActiveByUserId.mockResolvedValue([{ id: "rc-1", codeHash: "h1" }]);
    recoveryCodeService.findMatch.mockResolvedValue(-1);
    await expect(
      mfaService.verifyRecovery({ user, sessionId: "sid-1", code: "x" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
  });

  test("locked out → MFA_LOCKED_OUT", async () => {
    const lockedUser = { ...user, mfaLockedUntil: new Date(Date.now() + 60000) };
    await expect(
      mfaService.verifyRecovery({ user: lockedUser, sessionId: "sid-1", code: "x" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_LOCKED_OUT" });
  });
});

describe("mfaService.disable", () => {
  test("happy path: non-required user with password + valid code → wipes everything", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: new Date(),
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
    bcrypt.compare.mockResolvedValue(true);

    await mfaService.disable({ user, password: "pw", code: "000000" }, "trx");

    expect(mfaSecretRepository.deleteForUser).toHaveBeenCalledWith("user-1", "trx");
    expect(mfaRecoveryCodeRepository.deleteForUser).toHaveBeenCalledWith("user-1", "trx");
    expect(mfaTrustedDeviceRepository.revokeAllForUser).toHaveBeenCalledWith("user-1", "trx");
    expect(userRepository.clearMfaEnrollment).toHaveBeenCalledWith("user-1", "trx");
  });

  test("user in MFA-required role → MFA_REQUIRED_FOR_ROLE", async () => {
    const adminUser = {
      ...user,
      roleAssignments: [{ role: ROLES.ADMIN, facilityId: "f-1" }]
    };
    await expect(
      mfaService.disable({ user: adminUser, password: "pw", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_REQUIRED_FOR_ROLE" });
  });

  test("wrong password → INVALID_CREDENTIALS", async () => {
    bcrypt.compare.mockResolvedValue(false);
    await expect(
      mfaService.disable({ user, password: "wrong", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  test("no enrolled secret → MFA_NOT_ENROLLED", async () => {
    bcrypt.compare.mockResolvedValue(true);
    mfaSecretRepository.findByUserId.mockResolvedValue(null);
    await expect(
      mfaService.disable({ user, password: "pw", code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_NOT_ENROLLED" });
  });

  test("invalid code → INVALID_TOTP_CODE", async () => {
    bcrypt.compare.mockResolvedValue(true);
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: new Date(),
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
    totpService.verifyCode.mockReturnValue(null);
    await expect(
      mfaService.disable({ user, password: "pw", code: "bad" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
  });
});

describe("mfaService.regenerateRecoveryCodes", () => {
  beforeEach(() => {
    mfaSecretRepository.findByUserId.mockResolvedValue({
      verifiedAt: new Date(),
      secretEncrypted: Buffer.from("ct"),
      secretNonce: Buffer.alloc(12, 0)
    });
  });

  test("happy path: revokes old set, inserts new, returns 10 plaintext codes", async () => {
    const result = await mfaService.regenerateRecoveryCodes({ user, code: "000000" }, "trx");
    expect(result.recoveryCodes).toHaveLength(3);
    expect(mfaRecoveryCodeRepository.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      "trx"
    );
    expect(mfaRecoveryCodeRepository.createMany).toHaveBeenCalled();
  });

  test("invalid code → INVALID_TOTP_CODE; no rotation happens", async () => {
    totpService.verifyCode.mockReturnValue(null);
    await expect(
      mfaService.regenerateRecoveryCodes({ user, code: "bad" }, "trx")
    ).rejects.toMatchObject({ code: "INVALID_TOTP_CODE" });
    expect(mfaRecoveryCodeRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  test("no secret → MFA_NOT_ENROLLED", async () => {
    mfaSecretRepository.findByUserId.mockResolvedValue(null);
    await expect(
      mfaService.regenerateRecoveryCodes({ user, code: "000000" }, "trx")
    ).rejects.toMatchObject({ code: "MFA_NOT_ENROLLED" });
  });
});

describe("mfaService.adminReset / hasSharedFacilityAdmin", () => {
  const admin = {
    id: "admin-1",
    roleAssignments: [{ role: ROLES.ADMIN, facilityId: "f-1" }]
  };
  const target = {
    id: "target-1",
    roleAssignments: [{ role: ROLES.AUTHOR, facilityId: "f-1" }]
  };
  const outsider = {
    id: "outsider-1",
    roleAssignments: [{ role: ROLES.AUTHOR, facilityId: "f-other" }]
  };

  test("hasSharedFacilityAdmin: admin shares facility → true", () => {
    expect(mfaService.hasSharedFacilityAdmin(admin, target)).toBe(true);
  });

  test("hasSharedFacilityAdmin: admin in different facility → false", () => {
    expect(mfaService.hasSharedFacilityAdmin(admin, outsider)).toBe(false);
  });

  test("hasSharedFacilityAdmin: non-admin actor → false", () => {
    const nonAdmin = {
      roleAssignments: [{ role: ROLES.AUTHOR, facilityId: "f-1" }]
    };
    expect(mfaService.hasSharedFacilityAdmin(nonAdmin, target)).toBe(false);
  });

  test("hasSharedFacilityAdmin: missing inputs → false", () => {
    expect(mfaService.hasSharedFacilityAdmin(null, target)).toBe(false);
    expect(mfaService.hasSharedFacilityAdmin(admin, null)).toBe(false);
    expect(mfaService.hasSharedFacilityAdmin({}, {})).toBe(false);
  });

  test("adminReset: shared facility → wipes target's MFA state and sessions", async () => {
    userRepository.findUserById.mockResolvedValue(target);
    const result = await mfaService.adminReset(
      { actor: admin, targetUserId: target.id },
      "trx"
    );
    expect(result.target).toBe(target);
    expect(mfaSecretRepository.deleteForUser).toHaveBeenCalledWith(target.id, "trx");
    expect(mfaRecoveryCodeRepository.deleteForUser).toHaveBeenCalledWith(target.id, "trx");
    expect(mfaTrustedDeviceRepository.revokeAllForUser).toHaveBeenCalledWith(target.id, "trx");
    expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(
      target.id,
      expect.any(Date),
      "trx"
    );
    expect(userRepository.clearMfaEnrollment).toHaveBeenCalledWith(target.id, "trx");
  });

  test("adminReset: no shared facility → ADMIN_RESET_NOT_AUTHORIZED", async () => {
    userRepository.findUserById.mockResolvedValue(outsider);
    await expect(
      mfaService.adminReset({ actor: admin, targetUserId: outsider.id }, "trx")
    ).rejects.toMatchObject({ code: "ADMIN_RESET_NOT_AUTHORIZED" });
  });

  test("adminReset: missing actor/target → ADMIN_RESET_NOT_AUTHORIZED", async () => {
    await expect(
      mfaService.adminReset({ actor: null, targetUserId: "x" }, "trx")
    ).rejects.toMatchObject({ code: "ADMIN_RESET_NOT_AUTHORIZED" });
    await expect(
      mfaService.adminReset({ actor: admin, targetUserId: null }, "trx")
    ).rejects.toMatchObject({ code: "ADMIN_RESET_NOT_AUTHORIZED" });
  });

  test("adminReset: target user not found → ADMIN_RESET_NOT_AUTHORIZED", async () => {
    userRepository.findUserById.mockResolvedValue(null);
    await expect(
      mfaService.adminReset({ actor: admin, targetUserId: "ghost" }, "trx")
    ).rejects.toMatchObject({ code: "ADMIN_RESET_NOT_AUTHORIZED" });
  });
});
