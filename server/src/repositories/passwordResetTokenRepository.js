const db = require("../db/knex");

function mapToken(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    tokenHash: row.token_hash,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    sourceIp: row.source_ip,
    userAgent: row.user_agent
  };
}

async function createToken(
  { id, tokenHash, userId, expiresAt, sourceIp = null, userAgent = null },
  trx = db
) {
  const [row] = await trx("password_reset_tokens")
    .insert({
      id,
      token_hash: tokenHash,
      user_id: userId,
      expires_at: expiresAt,
      source_ip: sourceIp,
      user_agent: userAgent
    })
    .returning("*");
  return mapToken(row);
}

async function findActiveByHash(tokenHash, now = new Date(), trx = db) {
  if (!tokenHash) {
    return null;
  }
  const row = await trx("password_reset_tokens").where({ token_hash: tokenHash }).first();
  if (!row) {
    return null;
  }
  if (row.used_at) {
    return null;
  }
  if (row.expires_at && new Date(row.expires_at) <= now) {
    return null;
  }
  return mapToken(row);
}

async function markUsed(id, now = new Date(), trx = db) {
  if (!id) {
    return 0;
  }
  return trx("password_reset_tokens")
    .where({ id })
    .whereNull("used_at")
    .update({ used_at: now });
}

async function revokeAllForUser(userId, now = new Date(), trx = db) {
  if (!userId) {
    return 0;
  }
  return trx("password_reset_tokens")
    .where({ user_id: userId })
    .whereNull("used_at")
    .update({ used_at: now });
}

/**
 * Delete fully-resolved reset tokens that are past their `expires_at`.
 *
 * TODO: schedule via cron (no scheduler is wired yet).
 */
async function cleanupExpired(now = new Date(), trx = db) {
  return trx("password_reset_tokens").where("expires_at", "<", now).del();
}

module.exports = {
  createToken,
  findActiveByHash,
  markUsed,
  revokeAllForUser,
  cleanupExpired
};
