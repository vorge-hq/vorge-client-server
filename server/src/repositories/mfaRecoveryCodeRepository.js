const crypto = require("crypto");
const db = require("../db/knex");

function mapCode(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    codeHash: row.code_hash,
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

async function createMany({ userId, codeHashes }, trx = db) {
  if (!userId || !Array.isArray(codeHashes) || codeHashes.length === 0) {
    return [];
  }
  const rows = codeHashes.map((codeHash) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    code_hash: codeHash
  }));
  return trx("mfa_recovery_codes").insert(rows).returning("*").then((inserted) => inserted.map(mapCode));
}

async function findActiveByUserId(userId, trx = db) {
  if (!userId) return [];
  const rows = await trx("mfa_recovery_codes")
    .where({ user_id: userId })
    .whereNull("used_at")
    .orderBy("created_at", "asc");
  return rows.map(mapCode);
}

async function markUsed(id, now = new Date(), trx = db) {
  if (!id) return 0;
  return trx("mfa_recovery_codes").where({ id }).whereNull("used_at").update({ used_at: now });
}

async function revokeAllForUser(userId, now = new Date(), trx = db) {
  if (!userId) return 0;
  return trx("mfa_recovery_codes")
    .where({ user_id: userId })
    .whereNull("used_at")
    .update({ used_at: now });
}

async function deleteForUser(userId, trx = db) {
  if (!userId) return 0;
  return trx("mfa_recovery_codes").where({ user_id: userId }).del();
}

module.exports = {
  createMany,
  findActiveByUserId,
  markUsed,
  revokeAllForUser,
  deleteForUser
};
