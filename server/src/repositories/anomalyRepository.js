// P4 · O6 — anomaly acknowledgement persistence (§9.2). Flags themselves are
// never stored (recomputed per check); only an Author's dismissal is durable.
//
// Facility-scoped DATA table: every read/write is pinned by facilityScope (RLS)
// AND filtered by facility_id here. The write runs INSIDE the caller's
// transaction (trx always passed) alongside the audit append — the same atomic
// savepoint discipline as contentWriteGuard.
const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");

function mapAcknowledgement(row) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    authorUserId: row.author_user_id,
    ruleKey: row.rule_key,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    reasonText: row.reason_text || null,
    createdAt: row.created_at
  };
}

// This Author's dismissals on this assessment — the set subtracted from a fresh
// flag computation. Scoped to author_user_id BY DESIGN (§9.2): another Author on
// the same assessment sees the warning fresh.
async function listAcknowledgements({ facilityId, assessmentId, authorUserId, conn = activeConn() }) {
  const rows = await conn("anomaly_acknowledgements")
    .where({ facility_id: facilityId, assessment_id: assessmentId, author_user_id: authorUserId })
    .orderBy("created_at", "asc");
  return rows.map(mapAcknowledgement);
}

// Upsert on the natural key: re-acknowledging the same flag (e.g. the Author
// changes the reason) updates the row rather than colliding. Returns the stored
// acknowledgement and whether it replaced an existing one, so the route can put
// the previous reason in the audit diff.
async function saveAcknowledgement({
  facilityId,
  assessmentId,
  authorUserId,
  ruleKey,
  entityType,
  entityId,
  reason,
  reasonText = null,
  trx
}) {
  const existing = await trx("anomaly_acknowledgements")
    .where({
      facility_id: facilityId,
      assessment_id: assessmentId,
      author_user_id: authorUserId,
      rule_key: ruleKey,
      entity_type: entityType,
      entity_id: entityId
    })
    .first();

  const [row] = await trx("anomaly_acknowledgements")
    .insert({
      id: crypto.randomUUID(),
      facility_id: facilityId,
      assessment_id: assessmentId,
      author_user_id: authorUserId,
      rule_key: ruleKey,
      entity_type: entityType,
      entity_id: entityId,
      reason,
      reason_text: reasonText
    })
    .onConflict(["assessment_id", "author_user_id", "rule_key", "entity_type", "entity_id"])
    .merge({ reason, reason_text: reasonText, updated_at: trx.fn.now() })
    .returning("*");

  return { acknowledgement: mapAcknowledgement(row), previous: existing ? mapAcknowledgement(existing) : null };
}

module.exports = { mapAcknowledgement, listAcknowledgements, saveAcknowledgement };
