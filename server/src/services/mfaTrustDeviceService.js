const crypto = require("crypto");
const env = require("../config/env");
const mfaTrustedDeviceRepository = require("../repositories/mfaTrustedDeviceRepository");

function generatePlaintextToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(plaintext) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Set the trust cookie on the response and persist its hash in the DB.
 * Cookie attributes are locked per chunk-4 spec: HttpOnly, Secure (env-cond),
 * SameSite=Strict, Path=/api/auth, fixed 30-day Max-Age.
 */
async function issueCookie(res, userId, trx) {
  if (!res || !userId) throw new Error("issueCookie: res and userId required");
  const plaintext = generatePlaintextToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + env.mfaTrustCookieMaxAgeMs);

  await mfaTrustedDeviceRepository.createDevice(
    { userId, cookieTokenHash: tokenHash, expiresAt },
    trx
  );

  res.cookie(env.mfaTrustCookieName, plaintext, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: env.mfaTrustCookiePath,
    maxAge: env.mfaTrustCookieMaxAgeMs,
    domain: env.cookieDomain
  });

  return { plaintext, tokenHash, expiresAt };
}

function clearCookie(res) {
  res.clearCookie(env.mfaTrustCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: env.mfaTrustCookiePath,
    domain: env.cookieDomain
  });
}

/**
 * Returns true if the request's trust cookie corresponds to an active device
 * for this user. Performs a touch-last-seen on a successful match.
 */
async function validateCookie(req, userId, now = new Date(), trx) {
  if (!req || !userId) return false;
  const plaintext = req.cookies && req.cookies[env.mfaTrustCookieName];
  if (!plaintext) return false;
  const tokenHash = hashToken(plaintext);
  const row = await mfaTrustedDeviceRepository.findActiveByHash(tokenHash, now, trx);
  if (!row || row.userId !== userId) return false;
  await mfaTrustedDeviceRepository.touchLastSeen(row.id, now, trx);
  return true;
}

async function revokeAllForUser(userId, trx) {
  return mfaTrustedDeviceRepository.revokeAllForUser(userId, trx);
}

module.exports = {
  issueCookie,
  clearCookie,
  validateCookie,
  revokeAllForUser,
  generatePlaintextToken,
  hashToken
};
