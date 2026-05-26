const db = require("../db/knex");

function mapRefreshToken(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    tokenHash: row.token_hash,
    familyId: row.family_id,
    parentId: row.parent_id,
    userId: row.user_id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at
  };
}

async function createRefreshToken(
  { id, tokenHash, familyId, parentId = null, userId, sessionId, expiresAt },
  trx = db
) {
  const [row] = await trx("refresh_tokens")
    .insert({
      id,
      token_hash: tokenHash,
      family_id: familyId,
      parent_id: parentId,
      user_id: userId,
      session_id: sessionId,
      expires_at: expiresAt
    })
    .returning("*");
  return mapRefreshToken(row);
}

async function findByHashForUpdate(tokenHash, trx) {
  if (!tokenHash || !trx) {
    return null;
  }
  const row = await trx("refresh_tokens").where({ token_hash: tokenHash }).forUpdate().first();
  return mapRefreshToken(row);
}

async function findByHash(tokenHash, trx = db) {
  if (!tokenHash) {
    return null;
  }
  const row = await trx("refresh_tokens").where({ token_hash: tokenHash }).first();
  return mapRefreshToken(row);
}

async function findActiveDescendantInFamily(familyId, parentId, now = new Date(), trx = db) {
  if (!familyId || !parentId) {
    return null;
  }
  const row = await trx("refresh_tokens")
    .where({ family_id: familyId, parent_id: parentId })
    .whereNull("revoked_at")
    .andWhere("expires_at", ">", now)
    .orderBy("created_at", "desc")
    .first();
  return mapRefreshToken(row);
}

async function isFamilyRevoked(familyId, trx = db) {
  if (!familyId) {
    return false;
  }
  const row = await trx("refresh_tokens")
    .where({ family_id: familyId })
    .whereNotNull("revoked_at")
    .first();
  return Boolean(row);
}

async function markUsed(id, now = new Date(), trx = db) {
  if (!id) {
    return 0;
  }
  return trx("refresh_tokens").where({ id }).whereNull("used_at").update({ used_at: now });
}

async function revokeFamily(familyId, now = new Date(), trx = db) {
  if (!familyId) {
    return 0;
  }
  return trx("refresh_tokens")
    .where({ family_id: familyId })
    .whereNull("revoked_at")
    .update({ revoked_at: now });
}

async function revokeAllForUser(userId, now = new Date(), trx = db) {
  if (!userId) {
    return 0;
  }
  return trx("refresh_tokens")
    .where({ user_id: userId })
    .whereNull("revoked_at")
    .update({ revoked_at: now });
}

async function revokeByHash(tokenHash, now = new Date(), trx = db) {
  if (!tokenHash) {
    return 0;
  }
  return trx("refresh_tokens")
    .where({ token_hash: tokenHash })
    .whereNull("revoked_at")
    .update({ revoked_at: now });
}

/**
 * Delete refresh tokens that have passed their expiry and were either never
 * revoked or revoked more than 30 days ago. Mirrors the chunk-1
 * sessions cleanup window so forensic review (audit log) still resolves
 * recently-revoked tokens.
 *
 * TODO: schedule via cron (no scheduler is wired yet).
 */
async function cleanupExpired(now = new Date(), trx = db) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return trx("refresh_tokens")
    .where("expires_at", "<", now)
    .andWhere((qb) => qb.whereNull("revoked_at").orWhere("revoked_at", "<", cutoff))
    .del();
}

module.exports = {
  createRefreshToken,
  findByHash,
  findByHashForUpdate,
  findActiveDescendantInFamily,
  isFamilyRevoked,
  markUsed,
  revokeFamily,
  revokeAllForUser,
  revokeByHash,
  cleanupExpired
};
