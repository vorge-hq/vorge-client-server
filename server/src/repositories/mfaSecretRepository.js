const db = require("../db/knex");

function mapSecret(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    secretEncrypted: row.secret_encrypted,
    secretNonce: row.secret_nonce,
    keyVersion: row.key_version,
    createdAt: row.created_at,
    verifiedAt: row.verified_at
  };
}

/**
 * Upsert a pending secret for a user. Last-write-wins per locked bake-in
 * "Concurrent enrollment race": if a row already exists (verified or pending),
 * it's overwritten with the new pending secret. The previous verified secret
 * is dropped — this is the documented behaviour (loser of the race must
 * restart). Callers that need to preserve a verified secret must check first.
 */
async function upsertPending(
  { userId, secretEncrypted, secretNonce, keyVersion = 1 },
  trx = db
) {
  await trx("mfa_secrets")
    .insert({
      user_id: userId,
      secret_encrypted: secretEncrypted,
      secret_nonce: secretNonce,
      key_version: keyVersion,
      verified_at: null
    })
    .onConflict("user_id")
    .merge();
  return findByUserId(userId, trx);
}

async function findByUserId(userId, trx = db) {
  if (!userId) return null;
  const row = await trx("mfa_secrets").where({ user_id: userId }).first();
  return mapSecret(row);
}

/**
 * Promote a pending row to verified. Idempotent: a second call with the same
 * inputs is a no-op. Returns the row count actually updated (0 or 1).
 */
async function promotePending(userId, now = new Date(), trx = db) {
  if (!userId) return 0;
  return trx("mfa_secrets")
    .where({ user_id: userId })
    .whereNull("verified_at")
    .update({ verified_at: now });
}

async function deleteForUser(userId, trx = db) {
  if (!userId) return 0;
  return trx("mfa_secrets").where({ user_id: userId }).del();
}

/**
 * Delete pending secrets older than 24h. JSDoc-noted future-cron target.
 * TODO: schedule via cron once the scheduler infrastructure lands.
 */
async function cleanupExpiredPending(now = new Date(), trx = db) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return trx("mfa_secrets")
    .whereNull("verified_at")
    .andWhere("created_at", "<", cutoff)
    .del();
}

module.exports = {
  upsertPending,
  findByUserId,
  promotePending,
  deleteForUser,
  cleanupExpiredPending
};
