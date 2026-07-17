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

// entity_id carries no FK (it may point at an asset, threat or evaluation), so
// referential integrity is enforced here instead: the named entity must exist in
// THIS assessment. Without this check any uuid would mint a durable row —
// unbounded junk data and an audit row per POST (security sweep 2026-07-16, F1).
const ENTITY_TABLES = Object.freeze({ asset: "assets", threat: "threats", evaluation: "evaluations" });

async function entityBelongsToAssessment({ entityType, entityId, assessmentId, conn = activeConn() }) {
  const table = ENTITY_TABLES[entityType];
  if (!table) {
    return false;
  }
  const row = await conn(table).where({ id: entityId, assessment_id: assessmentId }).first();
  return Boolean(row);
}

// The other half of the same guard: even with real entities, rule_key is free
// text (deliberately — the rule catalogue must not need a migration), so the row
// count per (assessment, author) is capped well above any legitimate use
// (~tens of entities × a handful of rules) but far below abuse.
async function countAcknowledgements({ facilityId, assessmentId, authorUserId, conn = activeConn() }) {
  const result = await conn("anomaly_acknowledgements")
    .where({ facility_id: facilityId, assessment_id: assessmentId, author_user_id: authorUserId })
    .count({ total: "id" })
    .first();
  return Number(result && result.total ? result.total : 0);
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

module.exports = {
  mapAcknowledgement,
  listAcknowledgements,
  saveAcknowledgement,
  entityBelongsToAssessment,
  countAcknowledgements
};
