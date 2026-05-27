const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const db = require("../db/knex");
const passwordResetTokenRepository = require("../repositories/passwordResetTokenRepository");
const sessionRepository = require("../repositories/sessionRepository");
const refreshTokenRepository = require("../repositories/refreshTokenRepository");
const {
  findUserByEmail,
  findUserById,
  updatePasswordHash
} = require("../repositories/userRepository");
const { DomainError } = require("./domainError");

const MIN_PASSWORD_LENGTH = 12;

function invalidTokenError() {
  return new DomainError(
    "Reset token invalid, expired, or already used",
    401,
    "INVALID_RESET_TOKEN"
  );
}

function passwordTooShortError() {
  return new DomainError(
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    400,
    "PASSWORD_TOO_SHORT"
  );
}

function generatePlaintextToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(plaintext) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function computeExpiresAt() {
  const probe = jwt.sign({}, env.jwtSecret, {
    expiresIn: env.passwordResetTokenExpiresIn
  });
  const decoded = jwt.decode(probe);
  return new Date(decoded.exp * 1000);
}

async function requestReset({ email, req }, trx = db) {
  const user = await findUserByEmail(email, trx);
  if (!user) {
    return null;
  }
  const plaintextToken = generatePlaintextToken();
  const tokenHash = hashToken(plaintextToken);
  const id = crypto.randomUUID();
  const expiresAt = computeExpiresAt();

  await passwordResetTokenRepository.createToken(
    {
      id,
      tokenHash,
      userId: user.id,
      expiresAt,
      sourceIp: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null
    },
    trx
  );

  const resetUrl = `${env.appBaseUrl}/reset-password?token=${plaintextToken}`;
  return { user, plaintextToken, resetUrl, expiresAt, tokenId: id };
}

async function consumeToken({ plaintextToken, newPassword }, trx = db) {
  if (!plaintextToken) {
    throw invalidTokenError();
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw passwordTooShortError();
  }

  const tokenHash = hashToken(plaintextToken);
  const tokenRow = await passwordResetTokenRepository.findActiveByHash(tokenHash, new Date(), trx);
  if (!tokenRow) {
    throw invalidTokenError();
  }

  const user = await findUserById(tokenRow.userId, trx);
  if (!user) {
    throw invalidTokenError();
  }

  const newHash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await updatePasswordHash(user.id, newHash, trx);
  await passwordResetTokenRepository.markUsed(tokenRow.id, new Date(), trx);

  return user;
}

async function invalidateAllUserSessions({ userId }, trx = db) {
  const now = new Date();
  const sessionsRevoked = await sessionRepository.revokeAllForUser(userId, now, trx);
  const refreshRevoked = await refreshTokenRepository.revokeAllForUser(userId, now, trx);
  return { sessionsRevoked, refreshRevoked };
}

module.exports = {
  requestReset,
  consumeToken,
  invalidateAllUserSessions,
  generatePlaintextToken,
  hashToken,
  computeExpiresAt,
  MIN_PASSWORD_LENGTH
};
