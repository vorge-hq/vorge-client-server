const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");
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

async function getPreviousHash({ facilityId, trx = activeConn() }) {
  const query = trx("audit_log_entries").select("hash").orderBy("created_at", "desc").orderBy("id", "desc").first();

  if (facilityId) {
    query.where("facility_id", facilityId);
  } else {
    query.whereNull("facility_id");
  }

  const latest = await query;
  return latest?.hash || null;
}

async function appendAuditLog(event, conn = activeConn()) {
  // audit_log_entries is RLS-protected, but audit writes happen BOTH inside
  // facility-scoped requests (workflow/mitigation) AND outside them — auth
  // events (login/logout/admin reset) run with no request context. Under the
  // non-owner app role that means the WITH CHECK policy denies the INSERT (→ a
  // 500 on login) and the hash-chain read-back silently returns nothing.
  //
  // So run the read-back + insert in ONE transaction whose facility context is
  // THIS entry's own facility. When the caller already passed a transaction,
  // conn.transaction() opens a savepoint on it — the audit write stays atomic
  // with the caller's work. When called standalone (failed-login audit), it's a
  // real transaction so SET LOCAL actually persists across the two statements.
  return conn.transaction(async (trx) => {
    if (event.facilityId) {
      await trx.raw("SELECT set_config('app.current_facility_ids', ?, true)", [event.facilityId]);
    }
    const previousHash = await getPreviousHash({ facilityId: event.facilityId, trx });
    const entry = createAuditEntry({ ...event, previousHash });
    await trx("audit_log_entries").insert(toAuditRow(entry));
    return entry;
  });
}

module.exports = {
  appendAuditLog,
  getPreviousHash
};
