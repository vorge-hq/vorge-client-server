const OTPAuth = require("otpauth");
const env = require("../config/env");

const ISSUER = "Vorge";
const TOTP_PARAMS = {
  algorithm: "SHA1",
  digits: 6,
  period: 30
};

function isTestBypassActive() {
  return env.nodeEnv === "test" && process.env.__MFA_TEST_MODE__ === "1";
}

function generateSecret() {
  return new OTPAuth.Secret({ size: 32 }).base32;
}

function buildOtpauthUrl({ secretBase32, accountLabel }) {
  if (!secretBase32 || !accountLabel) {
    throw new Error("buildOtpauthUrl: secretBase32 and accountLabel required");
  }
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    ...TOTP_PARAMS
  });
  return totp.toString();
}

/**
 * Verify a TOTP code with ±1 window acceptance (RFC 6238 default).
 * In test-mode bypass: accepts "000000" only.
 * Returns the matched-window offset (-1, 0, 1) on success, null on failure.
 */
function verifyCode({ secretBase32, code, now = Date.now() }) {
  if (isTestBypassActive()) {
    return code === "000000" ? 0 : null;
  }
  if (!secretBase32 || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return null;
  }
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: "verify",
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    ...TOTP_PARAMS
  });
  const delta = totp.validate({ token: code, timestamp: now, window: 1 });
  return delta;
}

/**
 * Used-code cache for replay protection. In-memory, single-process.
 * Per docs/decisions/chunk-4-mfa.md §Bake-ins, this is acknowledged
 * single-instance state; multi-instance deploy needs Redis migration.
 *
 * Key: `${userId}:${code}`. Value: expiresAt epoch-ms. We cover the full
 * ±1 window (90s) to be safe.
 */
const replayCache = new Map();
const REPLAY_WINDOW_MS = 90 * 1000;

function _cleanReplay(now) {
  for (const [key, expiresAt] of replayCache.entries()) {
    if (expiresAt < now) replayCache.delete(key);
  }
}

function isReplay(userId, code, now = Date.now()) {
  _cleanReplay(now);
  return replayCache.has(`${userId}:${code}`);
}

function recordCodeUse(userId, code, now = Date.now()) {
  replayCache.set(`${userId}:${code}`, now + REPLAY_WINDOW_MS);
}

function _resetReplayCache() {
  replayCache.clear();
}

module.exports = {
  generateSecret,
  buildOtpauthUrl,
  verifyCode,
  isReplay,
  recordCodeUse,
  isTestBypassActive,
  _resetReplayCache,
  TOTP_PARAMS,
  ISSUER
};
