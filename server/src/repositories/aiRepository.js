// P4 · O2 — ai_call_log writes + month-to-date cost sums, and ai_budgets
// read/soft-alert-latch. Pure DB access; all the ceiling/cost math lives in
// services/aiBudgetService (95% coverage gate). Exercised for real from O3
// integration tests; O2 module unit tests mock this module wholesale.
const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");

// Compute the [start, end) UTC range for a 'YYYY-MM' month key.
function monthRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}

// One ai_call_log row per runAiCall outcome (success AND every failure class).
// Mirrors appendAuditLog: run the insert in a transaction that sets this row's
// own facility GUC, so a facility-scoped write succeeds under RLS whether the
// caller is already inside a request scope (savepoint) or standalone.
async function logCall(row, conn = activeConn()) {
  const record = {
    id: crypto.randomUUID(),
    feature: row.feature,
    facility_id: row.facilityId || null,
    operator_id: row.operatorId || null,
    user_id: row.userId,
    acting_role: row.actingRole || null,
    provider: row.provider,
    model: row.model,
    input_tokens: row.inputTokens || 0,
    output_tokens: row.outputTokens || 0,
    cost_usd: row.costUsd || 0,
    latency_ms: row.latencyMs || 0,
    outcome: row.outcome,
    error_detail: row.errorDetail || null,
    trace_id: row.traceId || null,
    metadata: row.metadata || {}
  };
  // Stamp created_at from the caller's clock when supplied (runAiCall passes the
  // same instant it derived monthKey from), so accrual and ceiling logic agree;
  // otherwise fall back to the column's DB default (now()).
  if (row.createdAt) {
    record.created_at = row.createdAt;
  }

  return conn.transaction(async (trx) => {
    if (record.facility_id) {
      await trx.raw("SELECT set_config('app.current_facility_ids', ?, true)", [record.facility_id]);
    }
    await trx("ai_call_log").insert(record);
    return record;
  });
}

// Month-to-date SUM(cost_usd) for a scope — the budget accrual figure. Sums all
// outcomes (0-cost rows like cost_ceiling_hit / entitlement denials don't add).
async function getMonthToDateCost({ scope, scopeId, monthKey }, conn = activeConn()) {
  const { start, end } = monthRange(monthKey);
  const column = scope === "operator" ? "operator_id" : "facility_id";
  const result = await conn("ai_call_log")
    .where(column, scopeId)
    .andWhere("created_at", ">=", start)
    .andWhere("created_at", "<", end)
    .sum({ total: "cost_usd" })
    .first();
  return Number(result && result.total ? result.total : 0);
}

// The budget row for a scope, or null when none exists (caller applies the
// per-scope default).
async function getBudget({ scope, scopeId }, conn = activeConn()) {
  const row = await conn("ai_budgets").where({ scope, scope_id: scopeId }).first();
  if (!row) {
    return null;
  }
  return {
    monthlyUsd: Number(row.monthly_usd),
    softAlertedForMonth: row.soft_alerted_for_month
  };
}

// Latch the once-per-month soft alert. Upserts so a scope with no explicit
// budget row still records the alert (using the provided default ceiling).
async function markSoftAlerted({ scope, scopeId, monthKey, monthlyUsd }, conn = activeConn()) {
  await conn("ai_budgets")
    .insert({
      id: crypto.randomUUID(),
      scope,
      scope_id: scopeId,
      monthly_usd: monthlyUsd,
      soft_alerted_for_month: monthKey
    })
    .onConflict(["scope", "scope_id"])
    .merge({ soft_alerted_for_month: monthKey });
}

module.exports = { logCall, getMonthToDateCost, getBudget, markSoftAlerted };
