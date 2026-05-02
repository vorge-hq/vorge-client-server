const crypto = require("crypto");
const db = require("../db/knex");
const { createAuditEntry } = require("../services/auditService");

function toAuditRow(entry) {
  return {
    id: crypto.randomUUID(),
    facility_id: entry.facilityId,
    assessment_id: entry.assessmentId,
    user_id: entry.userId,
    acting_role: entry.actingRole,
    action_type: entry.actionType,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    diff: entry.diff,
    metadata: entry.metadata,
    trace_id: entry.traceId,
    previous_hash: entry.previousHash,
    hash: entry.hash,
    created_at: entry.timestamp
  };
}

async function getPreviousHash({ facilityId, trx = db }) {
  const query = trx("audit_log_entries").select("hash").orderBy("created_at", "desc").orderBy("id", "desc").first();

  if (facilityId) {
    query.where("facility_id", facilityId);
  } else {
    query.whereNull("facility_id");
  }

  const latest = await query;
  return latest?.hash || null;
}

async function appendAuditLog(event, trx = db) {
  const previousHash = await getPreviousHash({ facilityId: event.facilityId, trx });
  const entry = createAuditEntry({ ...event, previousHash });

  await trx("audit_log_entries").insert(toAuditRow(entry));

  return entry;
}

module.exports = {
  appendAuditLog,
  getPreviousHash
};
