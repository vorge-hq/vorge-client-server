const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const db = require("../db/knex");
const refreshTokenRepository = require("../repositories/refreshTokenRepository");
const sessionService = require("./sessionService");
const { DomainError } = require("./domainError");

const REUSE_WINDOW_MS = 30 * 1000;

function invalidRefreshError(replay = false) {
  const error = new DomainError("Refresh token invalid or expired", 401, "INVALID_REFRESH_TOKEN");
  error.replayDetected = replay;
  return error;
}

function generatePlaintextToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(plaintext) {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

// Single source of truth for the refresh-token expiry: jsonwebtoken's own
// parser. Sign a throwaway with `expiresIn: env.refreshTokenExpiresIn` and
// read the `exp` claim back. Mirrors the chunk-1 sessionService pattern.
function computeExpiresAt() {
  const probe = jwt.sign({}, env.jwtSecret, { expiresIn: env.refreshTokenExpiresIn });
  const decoded = jwt.decode(probe);
  return new Date(decoded.exp * 1000);
}

async function issueInitial({ user, sessionId }, trx = db) {
  const plaintextToken = generatePlaintextToken();
  const tokenHash = hashToken(plaintextToken);
  const familyId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const expiresAt = computeExpiresAt();

  await refreshTokenRepository.createRefreshToken(
    {
      id,
      tokenHash,
      familyId,
      parentId: null,
      userId: user.id,
      sessionId,
      expiresAt
    },
    trx
  );

  return { plaintextToken, expiresAt, familyId, refreshTokenId: id };
}

async function rotate({ presentedPlaintext, user, actingRole, now = new Date(), req }, trx) {
  if (!trx) {
    throw new Error("refreshTokenService.rotate must be called inside a db.transaction(...) callback");
  }
  if (!presentedPlaintext) {
    throw invalidRefreshError();
  }

  const tokenHash = hashToken(presentedPlaintext);
  const row = await refreshTokenRepository.findByHashForUpdate(tokenHash, trx);

  if (!row) {
    throw invalidRefreshError();
  }

  if (row.revokedAt) {
    throw invalidRefreshError(true);
  }

  if (await refreshTokenRepository.isFamilyRevoked(row.familyId, trx)) {
    throw invalidRefreshError(true);
  }

  if (new Date(row.expiresAt) <= now) {
    throw invalidRefreshError();
  }

  if (row.usedAt) {
    const ageMs = now.getTime() - new Date(row.usedAt).getTime();
    if (ageMs > REUSE_WINDOW_MS) {
      await refreshTokenRepository.revokeFamily(row.familyId, now, trx);
      throw invalidRefreshError(true);
    }

    const descendant = await refreshTokenRepository.findActiveDescendantInFamily(
      row.familyId,
      row.id,
      now,
      trx
    );

    if (descendant) {
      return {
        wasReuseWindow: true,
        plaintextToken: null,
        expiresAt: descendant.expiresAt,
        sessionId: descendant.sessionId,
        familyId: row.familyId,
        previousSid: row.sessionId,
        userId: row.userId
      };
    }
    // Genuine race: descendant not yet created. Fall through to normal rotation.
  }

  await refreshTokenRepository.markUsed(row.id, now, trx);

  const { sid: newSid } = await sessionService.rotateSession({
    user,
    previousSid: row.sessionId,
    actingRole,
    req,
    trx
  });

  const plaintextToken = generatePlaintextToken();
  const childHash = hashToken(plaintextToken);
  const childId = crypto.randomUUID();
  const childExpiresAt = computeExpiresAt();

  await refreshTokenRepository.createRefreshToken(
    {
      id: childId,
      tokenHash: childHash,
      familyId: row.familyId,
      parentId: row.id,
      userId: row.userId,
      sessionId: newSid,
      expiresAt: childExpiresAt
    },
    trx
  );

  return {
    wasReuseWindow: false,
    plaintextToken,
    expiresAt: childExpiresAt,
    sessionId: newSid,
    familyId: row.familyId,
    previousSid: row.sessionId,
    userId: row.userId
  };
}

async function revokeFamilyByToken(presentedPlaintext, now = new Date(), trx) {
  if (!presentedPlaintext || !trx) {
    return { revokedCount: 0, familyId: null };
  }
  const tokenHash = hashToken(presentedPlaintext);
  const row = await refreshTokenRepository.findByHashForUpdate(tokenHash, trx);
  if (!row) {
    return { revokedCount: 0, familyId: null };
  }
  const revokedCount = await refreshTokenRepository.revokeFamily(row.familyId, now, trx);
  return { revokedCount, familyId: row.familyId };
}

module.exports = {
  issueInitial,
  rotate,
  revokeFamilyByToken,
  generatePlaintextToken,
  hashToken,
  computeExpiresAt,
  REUSE_WINDOW_MS
};
