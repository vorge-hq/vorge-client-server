const db = require("../db/knex");

function mapSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    actingRole: row.acting_role,
    facilityId: row.facility_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    sourceIp: row.source_ip,
    userAgent: row.user_agent
  };
}

async function createSession(
  { id, userId, actingRole, facilityId = null, expiresAt, sourceIp = null, userAgent = null },
  trx = db
) {
  const [row] = await trx("sessions")
    .insert({
      id,
      user_id: userId,
      acting_role: actingRole,
      facility_id: facilityId,
      expires_at: expiresAt,
      source_ip: sourceIp,
      user_agent: userAgent
    })
    .returning("*");

  return mapSession(row);
}

async function findSessionById(sid, trx = db) {
  if (!sid) {
    return null;
  }
  const row = await trx("sessions").where({ id: sid }).first();
  return mapSession(row);
}

async function findActiveSessionById(sid, now = new Date(), trx = db) {
  if (!sid) {
    return null;
  }

  const row = await trx("sessions").where({ id: sid }).first();

  if (!row) {
    return null;
  }
  if (row.revoked_at) {
    return null;
  }
  if (row.expires_at && new Date(row.expires_at) <= now) {
    return null;
  }

  return mapSession(row);
}

async function revokeSession(sid, now = new Date(), trx = db) {
  if (!sid) {
    return 0;
  }

  return trx("sessions").where({ id: sid }).whereNull("revoked_at").update({ revoked_at: now });
}

async function revokeAllForUser(userId, now = new Date(), trx = db) {
  if (!userId) {
    return 0;
  }
  return trx("sessions")
    .where({ user_id: userId })
    .whereNull("revoked_at")
    .update({ revoked_at: now });
}

/**
 * Delete fully-expired sessions. Rows are removed when:
 *   - they have passed their `expires_at`, AND
 *   - they were either never revoked, OR were revoked more than 30 days ago.
 *
 * The 30-day window preserves recently-revoked rows long enough to surface
 * in any forensic review tied to the audit log.
 *
 * TODO: schedule via cron (no scheduler is wired yet).
 */
async function cleanupExpiredSessions(now = new Date(), trx = db) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return trx("sessions")
    .where("expires_at", "<", now)
    .andWhere((qb) => qb.whereNull("revoked_at").orWhere("revoked_at", "<", cutoff))
    .del();
}

module.exports = {
  createSession,
  findSessionById,
  findActiveSessionById,
  revokeSession,
  revokeAllForUser,
  cleanupExpiredSessions
};
