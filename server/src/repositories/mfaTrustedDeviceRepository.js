const crypto = require("crypto");
const db = require("../db/knex");

function mapDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    cookieTokenHash: row.cookie_token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

async function createDevice({ userId, cookieTokenHash, expiresAt }, trx = db) {
  if (!userId || !cookieTokenHash || !expiresAt) {
    throw new Error("createDevice: userId, cookieTokenHash, expiresAt are required");
  }
  const id = crypto.randomUUID();
  const [row] = await trx("mfa_trusted_devices")
    .insert({
      id,
      user_id: userId,
      cookie_token_hash: cookieTokenHash,
      expires_at: expiresAt
    })
    .returning("*");
  return mapDevice(row);
}

async function findActiveByHash(cookieTokenHash, now = new Date(), trx = db) {
  if (!cookieTokenHash) return null;
  const row = await trx("mfa_trusted_devices")
    .where({ cookie_token_hash: cookieTokenHash })
    .andWhere("expires_at", ">", now)
    .first();
  return mapDevice(row);
}

async function touchLastSeen(id, now = new Date(), trx = db) {
  if (!id) return 0;
  return trx("mfa_trusted_devices").where({ id }).update({ last_seen_at: now });
}

async function revokeAllForUser(userId, trx = db) {
  if (!userId) return 0;
  return trx("mfa_trusted_devices").where({ user_id: userId }).del();
}

/**
 * Delete expired trust-device rows. JSDoc-noted future-cron target.
 * TODO: schedule via cron once the scheduler infrastructure lands.
 */
async function cleanupExpired(now = new Date(), trx = db) {
  return trx("mfa_trusted_devices").where("expires_at", "<", now).del();
}

module.exports = {
  createDevice,
  findActiveByHash,
  touchLastSeen,
  revokeAllForUser,
  cleanupExpired
};
