const QRCode = require("qrcode");
const bcrypt = require("bcryptjs");
const db = require("../db/knex");
const { DomainError } = require("./domainError");
const env = require("../config/env");
const totpService = require("./totpService");
const recoveryCodeService = require("./recoveryCodeService");
const lockoutService = require("./mfaLockoutService");
const trustDeviceService = require("./mfaTrustDeviceService");
const mfaPolicy = require("./mfaPolicy");
const mfaEncryption = require("./mfaEncryption");
const mfaSecretRepository = require("../repositories/mfaSecretRepository");
const mfaRecoveryCodeRepository = require("../repositories/mfaRecoveryCodeRepository");
const mfaTrustedDeviceRepository = require("../repositories/mfaTrustedDeviceRepository");
const sessionRepository = require("../repositories/sessionRepository");
const userRepository = require("../repositories/userRepository");
const { ROLES } = require("./constants");

const KEY_VERSION = 1;

function invalidTotpError() {
  return new DomainError("Invalid or expired verification code", 401, "INVALID_TOTP_CODE");
}
function lockoutError(remainingMs, tier) {
  const err = new DomainError(
    `Too many failed attempts; try again later (tier ${tier})`,
    403,
    "MFA_LOCKED_OUT"
  );
  err.remainingMs = remainingMs;
  err.tier = tier;
  return err;
}
function notEnrolledError() {
  return new DomainError("MFA is not enrolled for this user", 400, "MFA_NOT_ENROLLED");
}
function enrollmentPendingError() {
  return new DomainError(
    "Pending enrollment secret has been replaced; restart enrollment",
    400,
    "MFA_ENROLLMENT_PENDING"
  );
}
function mfaRequiredForRoleError() {
  return new DomainError(
    "MFA cannot be disabled while you hold a role that requires it",
    403,
    "MFA_REQUIRED_FOR_ROLE"
  );
}
function invalidCredentialsError() {
  return new DomainError("Invalid credentials", 401, "INVALID_CREDENTIALS");
}
function adminResetNotAuthorizedError() {
  return new DomainError(
    "Admin reset requires that you are an Admin sharing at least one facility with the target user",
    403,
    "ADMIN_RESET_NOT_AUTHORIZED"
  );
}

async function loadActiveSecret(userId, trx) {
  const row = await mfaSecretRepository.findByUserId(userId, trx);
  if (!row || !row.verifiedAt) return null;
  return row;
}

function decryptSecret(row) {
  return mfaEncryption.decrypt(row.secretEncrypted, row.secretNonce);
}

/**
 * Start enrollment. Generates a fresh secret, encrypts it, upserts as pending.
 * Last-write-wins on concurrent enroll-start: the loser will get
 * "MFA_ENROLLMENT_PENDING" on enroll-verify.
 *
 * Returns { otpauthUrl, qrDataUrl, manualKey }.
 */
async function enrollStart({ user }, trx = db) {
  if (!user) throw invalidCredentialsError();
  const secretBase32 = totpService.generateSecret();
  const { ciphertext, nonce } = mfaEncryption.encrypt(secretBase32);

  await mfaSecretRepository.upsertPending(
    { userId: user.id, secretEncrypted: ciphertext, secretNonce: nonce, keyVersion: KEY_VERSION },
    trx
  );

  const otpauthUrl = totpService.buildOtpauthUrl({
    secretBase32,
    accountLabel: `Vorge:${user.email}`
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return { otpauthUrl, qrDataUrl, manualKey: secretBase32 };
}

/**
 * Verify the first code against the pending secret. On success: promote to
 * verified, set users.mfa_enrolled_at, issue 10 recovery codes (one-time
 * plaintext display), clear failure counters.
 *
 * Returns { recoveryCodes: [10 plaintext strings] }.
 */
async function enrollVerify({ user, code }, trx = db) {
  const row = await mfaSecretRepository.findByUserId(user.id, trx);
  if (!row) throw notEnrolledError();
  if (row.verifiedAt) {
    // Already enrolled — treat as a generic invalid-state to avoid leaking
    // state to the client.
    throw enrollmentPendingError();
  }
  const secretBase32 = decryptSecret(row);
  const ok = totpService.verifyCode({ secretBase32, code });
  if (ok === null) throw invalidTotpError();

  const now = new Date();
  await mfaSecretRepository.promotePending(user.id, now, trx);

  // Single-writer rule: both mfa_enrolled_at and mfa_enabled are written here.
  await userRepository.setMfaEnrolledAt(user.id, now, trx);
  await userRepository.updateMfaFailureState(user.id, lockoutService.clearedState(), trx);

  // Replace any existing recovery codes with a fresh set of 10.
  await mfaRecoveryCodeRepository.deleteForUser(user.id, trx);
  const { plaintexts, hashes } = await recoveryCodeService.generateCodes();
  await mfaRecoveryCodeRepository.createMany({ userId: user.id, codeHashes: hashes }, trx);

  totpService.recordCodeUse(user.id, code);

  return { recoveryCodes: plaintexts };
}

/**
 * Verify a TOTP code during login or step-up. On success:
 *   - clear failure counters
 *   - set session.mfa_satisfied = true
 *   - optionally issue a trust-device cookie
 *
 * On failure: advance the lockout state machine; possibly issue a lockout.
 *
 * Throws DomainError on failure. On success returns { trustCookieIssued: bool }.
 */
async function verifyTotp({ user, sessionId, code, trustDevice, req, res }, trx = db) {
  if (lockoutService.isLockedOut(user)) {
    throw lockoutError(
      lockoutService.remainingLockoutMs(user),
      lockoutService.lockoutTierFor(user.mfaFailedAttempts)
    );
  }
  const secret = await loadActiveSecret(user.id, trx);
  if (!secret) throw notEnrolledError();

  if (totpService.isReplay(user.id, code)) {
    return _recordFailure({ user, code, trx });
  }

  const secretBase32 = decryptSecret(secret);
  const delta = totpService.verifyCode({ secretBase32, code });
  if (delta === null) {
    return _recordFailure({ user, code, trx });
  }

  totpService.recordCodeUse(user.id, code);
  await userRepository.updateMfaFailureState(user.id, lockoutService.clearedState(), trx);
  await sessionRepository.setMfaSatisfied(sessionId, true, trx);

  let trustCookieIssued = false;
  if (trustDevice && res) {
    await trustDeviceService.issueCookie(res, user.id, trx);
    trustCookieIssued = true;
  }

  return { trustCookieIssued, outcome: "totp" };
}

async function _recordFailure({ user, trx }) {
  const state = lockoutService.nextFailureState(user);
  await userRepository.updateMfaFailureState(
    user.id,
    {
      failedAttempts: state.failedAttempts,
      lastFailureAt: state.lastFailureAt,
      lockedUntil: state.lockedUntil
    },
    trx
  );
  if (state.lockedUntil) {
    throw lockoutError(state.lockedUntil.getTime() - Date.now(), state.tier);
  }
  throw invalidTotpError();
}

/**
 * Verify a recovery code. On success: mark code used, set session
 * mfa_satisfied=true AND must_reenroll=true.
 */
async function verifyRecovery({ user, sessionId, code }, trx = db) {
  if (lockoutService.isLockedOut(user)) {
    throw lockoutError(
      lockoutService.remainingLockoutMs(user),
      lockoutService.lockoutTierFor(user.mfaFailedAttempts)
    );
  }
  const codes = await mfaRecoveryCodeRepository.findActiveByUserId(user.id, trx);
  if (codes.length === 0) {
    throw invalidTotpError();
  }
  const hashes = codes.map((c) => c.codeHash);
  const matchIdx = await recoveryCodeService.findMatch(code, hashes);
  if (matchIdx < 0) {
    throw invalidTotpError();
  }
  await mfaRecoveryCodeRepository.markUsed(codes[matchIdx].id, new Date(), trx);
  await userRepository.updateMfaFailureState(user.id, lockoutService.clearedState(), trx);
  await sessionRepository.setMfaSatisfied(sessionId, true, trx);
  await sessionRepository.setMustReenroll(sessionId, true, trx);
  return { outcome: "recovery" };
}

/**
 * Disable MFA. Requires current password + current TOTP. Forbidden when the
 * user holds any MFA-required role.
 */
async function disable({ user, password, code }, trx = db) {
  if (mfaPolicy.requiresMfa(user)) {
    throw mfaRequiredForRoleError();
  }
  const passwordMatches = user.passwordHash
    ? await bcrypt.compare(password || "", user.passwordHash)
    : false;
  if (!passwordMatches) throw invalidCredentialsError();

  const secret = await loadActiveSecret(user.id, trx);
  if (!secret) throw notEnrolledError();
  const secretBase32 = decryptSecret(secret);
  if (totpService.verifyCode({ secretBase32, code }) === null) {
    throw invalidTotpError();
  }

  await mfaSecretRepository.deleteForUser(user.id, trx);
  await mfaRecoveryCodeRepository.deleteForUser(user.id, trx);
  await mfaTrustedDeviceRepository.revokeAllForUser(user.id, trx);
  await userRepository.clearMfaEnrollment(user.id, trx);
}

/**
 * Regenerate the 10 recovery codes. Requires current TOTP. Invalidates the
 * existing set (mark all used) and inserts a fresh 10.
 */
async function regenerateRecoveryCodes({ user, code }, trx = db) {
  const secret = await loadActiveSecret(user.id, trx);
  if (!secret) throw notEnrolledError();
  const secretBase32 = decryptSecret(secret);
  if (totpService.verifyCode({ secretBase32, code }) === null) {
    throw invalidTotpError();
  }
  await mfaRecoveryCodeRepository.revokeAllForUser(user.id, new Date(), trx);
  const { plaintexts, hashes } = await recoveryCodeService.generateCodes();
  await mfaRecoveryCodeRepository.createMany({ userId: user.id, codeHashes: hashes }, trx);
  totpService.recordCodeUse(user.id, code);
  return { recoveryCodes: plaintexts };
}

/**
 * Returns true if `actor` is an Admin in at least one facility where `target`
 * also holds any role. Cross-tenant protection.
 */
function hasSharedFacilityAdmin(actor, target) {
  if (!actor?.roleAssignments || !target?.roleAssignments) return false;
  const adminFacilities = new Set(
    actor.roleAssignments
      .filter((a) => a.role === ROLES.ADMIN && a.facilityId)
      .map((a) => a.facilityId)
  );
  if (adminFacilities.size === 0) return false;
  return target.roleAssignments.some((a) => a.facilityId && adminFacilities.has(a.facilityId));
}

/**
 * Admin reset. Wipes target's secret, recovery codes, trusted devices,
 * sessions. Does NOT force password reset.
 */
async function adminReset({ actor, targetUserId }, trx = db) {
  if (!actor || !targetUserId) throw adminResetNotAuthorizedError();
  const target = await userRepository.findUserById(targetUserId, trx);
  if (!target) throw adminResetNotAuthorizedError();
  if (!hasSharedFacilityAdmin(actor, target)) throw adminResetNotAuthorizedError();

  await mfaSecretRepository.deleteForUser(target.id, trx);
  await mfaRecoveryCodeRepository.deleteForUser(target.id, trx);
  await mfaTrustedDeviceRepository.revokeAllForUser(target.id, trx);
  await sessionRepository.revokeAllForUser(target.id, new Date(), trx);
  await userRepository.clearMfaEnrollment(target.id, trx);

  return { target };
}

module.exports = {
  enrollStart,
  enrollVerify,
  verifyTotp,
  verifyRecovery,
  disable,
  regenerateRecoveryCodes,
  adminReset,
  hasSharedFacilityAdmin
};
