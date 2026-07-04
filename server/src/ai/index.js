// P4 · O2 — the AI module's public API. Every feature (O3–O7) calls runAiCall;
// no feature ever touches the gateway, a provider SDK, ceilings, or the audit
// table directly. The five ordered steps below are each observable in unit
// tests with the gateway mocked (tests/ai/*).
//
//   1. Entitlement check   — add-on features only; disabled → 403, NO gateway
//                            call, NO cost, NO audit row.
//   2. Ceiling check       — month-to-date SUM(cost_usd) vs budget: ≥100% →
//                            refuse (cost_ceiling_hit row written, other scopes
//                            unaffected); ≥80% → soft-alert ONCE/month, proceed.
//   3. Rate limit          — per scope, in-memory (Redis-swap caveat in
//                            rateLimiter.js); exceed → rate_limited row + 429.
//   4. Gateway call        — model string from config; transient failure →
//                            EXACTLY ONE backoff retry with the SAME model
//                            (never a fallback model/provider); second failure →
//                            503 "temporarily unavailable".
//   5. Audit write, ALWAYS — one ai_call_log row on success AND every failure
//                            class, with the full §9.7 field set. provider/model
//                            reflect what the gateway REPORTED, else the
//                            requested string flagged providerUnverified.
const gateway = require("./gateway");
const config = require("./config");
const rateLimiter = require("./rateLimiter");
const { buildPromptContext, buildOperatorPromptContext } = require("./promptContext");
const aiRepository = require("../repositories/aiRepository");
const entitlementsRepository = require("../repositories/entitlementsRepository");
const auditRepository = require("../repositories/auditRepository");
const budget = require("../services/aiBudgetService");
const { DomainError } = require("../services/domainError");
const env = require("../config/env");

// The AI features behind facility_entitlements. Base features (semantic search,
// smart tagging, drafted summaries) are always on and never appear here.
const ENTITLEMENT_GATED = new Set(["anomaly_detection", "consistency_flagging"]);

// Same "no real sleep in tests" posture as middleware/rateLimit.js.
const RETRY_BACKOFF_MS = env.nodeEnv === "test" ? 0 : 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Provider guess for pre-gateway / failure rows, where no gateway metadata
// exists: the leading segment of the "provider/model" id.
function providerFromModel(model) {
  return String(model || "").split("/")[0] || "unknown";
}

function isTimeout(err) {
  const code = err && err.code;
  const name = err && err.name;
  return code === "ETIMEDOUT" || name === "TimeoutError" || /timeout/i.test((err && err.message) || "");
}

// Never persist a raw error object (could carry request/config detail). Message
// only, bounded — the F2 "secrets not logged" guard.
function safeError(err) {
  return String((err && err.message) || "unknown error").slice(0, 500);
}

async function emitSoftAlert({ scope, scopeId, facilityId, userId, actingRole, traceId, monthKey, spentUsd, monthlyUsd }) {
  const pct = monthlyUsd > 0 ? Math.round((spentUsd / monthlyUsd) * 100) : 100;
  // Email lands with P5; for now console + an audit row is the alert channel.
  console.warn(`[ai-budget] soft alert — ${scope} ${scopeId} at ${pct}% of $${monthlyUsd} for ${monthKey}`);
  await auditRepository.appendAuditLog({
    actionType: "ai-budget-soft-alert",
    userId,
    actingRole,
    facilityId: facilityId || null,
    assessmentId: null,
    entityType: "ai_budget",
    entityId: scopeId,
    diff: null,
    metadata: { scope, monthKey, spentUsd, monthlyUsd },
    traceId
  });
}

async function runAiCall(params) {
  const {
    feature,
    kind,
    facilityId,
    operatorId,
    userId,
    actingRole,
    traceId,
    prompt,
    schema,
    value,
    now = new Date()
  } = params;

  const scope = operatorId ? "operator" : "facility";
  const scopeId = operatorId || facilityId;
  const monthKey = budget.monthKey(now);
  const model = config.modelFor(feature, kind);

  // Fields common to every terminal audit row. created_at is stamped from the
  // SAME `now` used to derive monthKey, so accrual (the month SUM) and the
  // ceiling/latch logic share one clock — no DB-vs-JS month-boundary straddle.
  const baseRow = { feature, facilityId, operatorId, userId, actingRole, model, traceId, createdAt: now };

  // ── 1. Entitlement (add-on features only) ─────────────────────────────────
  // Gated per-facility. anomaly_detection is always facility-scoped, so it is
  // gated here. consistency_flagging runs at OPERATOR scope (no single
  // facilityId) — its entitlement is enforced upstream by the O7 job, which
  // clusters only ENTITLED facilities, so the per-facility check is skipped when
  // there is no facilityId. See Open questions (F2) in the P4 execution plan.
  if (ENTITLEMENT_GATED.has(feature) && facilityId) {
    const enabled = await entitlementsRepository.isFeatureEnabled({ facilityId, featureKey: feature });
    if (!enabled) {
      // No gateway call, no cost, no audit row — refuse before anything runs.
      throw new DomainError("This AI feature is not enabled for this facility.", 403, "FEATURE_NOT_ENABLED", {
        feature
      });
    }
  }

  // ── 2. Ceiling ────────────────────────────────────────────────────────────
  const budgetRow = await aiRepository.getBudget({ scope, scopeId });
  const monthlyUsd = budgetRow ? budgetRow.monthlyUsd : budget.defaultMonthlyUsd(scope);
  const softAlertedForMonth = budgetRow ? budgetRow.softAlertedForMonth : null;
  const spentUsd = await aiRepository.getMonthToDateCost({ scope, scopeId, monthKey });
  const ceiling = budget.evaluateCeiling({ spentUsd, monthlyUsd, softAlertedForMonth, currentMonthKey: monthKey });

  if (ceiling.exhausted) {
    await aiRepository.logCall({
      ...baseRow,
      provider: providerFromModel(model),
      outcome: "cost_ceiling_hit",
      errorDetail: `Month-to-date spend $${spentUsd.toFixed(2)} >= ceiling $${monthlyUsd.toFixed(2)}`,
      metadata: { scope, monthKey, spentUsd, monthlyUsd, providerUnverified: true }
    });
    throw new DomainError(
      "The monthly AI budget has been reached. It resets at the start of next month.",
      429,
      "AI_BUDGET_EXHAUSTED",
      { scope, monthlyUsd }
    );
  }

  if (ceiling.shouldAlert) {
    // The soft alert is ADVISORY and best-effort: a hiccup writing the alert
    // audit row or the once-per-month latch must never fail the user's actual
    // AI call. At-least-once — an unlatched failure just re-alerts next call.
    try {
      await emitSoftAlert({ scope, scopeId, facilityId, userId, actingRole, traceId, monthKey, spentUsd, monthlyUsd });
      await aiRepository.markSoftAlerted({ scope, scopeId, monthKey, monthlyUsd });
    } catch (alertErr) {
      console.warn(`[ai-budget] soft-alert bookkeeping failed (proceeding): ${alertErr.message}`);
    }
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  try {
    rateLimiter.check(scopeId);
  } catch (_e) {
    await aiRepository.logCall({
      ...baseRow,
      provider: providerFromModel(model),
      outcome: "rate_limited",
      errorDetail: "Per-scope AI rate limit exceeded",
      metadata: { providerUnverified: true }
    });
    throw new DomainError("Too many AI requests; please slow down.", 429, "AI_RATE_LIMITED");
  }

  // ── 4. Gateway call — exactly one retry, SAME model both attempts ─────────
  const startedAt = Date.now();
  let result;
  try {
    result = await gateway.callModel({ kind, model, prompt, schema, value });
  } catch (_firstErr) {
    try {
      await sleep(RETRY_BACKOFF_MS);
      result = await gateway.callModel({ kind, model, prompt, schema, value });
    } catch (secondErr) {
      await aiRepository.logCall({
        ...baseRow,
        provider: providerFromModel(model),
        outcome: isTimeout(secondErr) ? "timeout" : "error",
        latencyMs: Date.now() - startedAt,
        errorDetail: safeError(secondErr),
        metadata: { providerUnverified: true, retried: true }
      });
      throw new DomainError(
        "AI service temporarily unavailable. Please try again in a few minutes.",
        503,
        "AI_TEMPORARILY_UNAVAILABLE"
      );
    }
  }
  const latencyMs = Date.now() - startedAt;

  // ── 5. Audit success ──────────────────────────────────────────────────────
  const provider = result.reportedProvider || providerFromModel(model);
  const resolvedModel = result.reportedModel || model;
  const providerUnverified = !result.reportedProvider || !result.reportedModel;
  const costUsd = budget.computeCost({
    model: resolvedModel,
    fallbackModel: model, // requested config id — always priced; guards a reported variant id
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    prices: config.prices
  });

  await aiRepository.logCall({
    ...baseRow,
    model: resolvedModel,
    provider,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    costUsd,
    latencyMs,
    outcome: "success",
    metadata: providerUnverified ? { providerUnverified: true } : {}
  });

  return { output: result.output, usage: result.usage };
}

module.exports = {
  runAiCall,
  buildPromptContext,
  buildOperatorPromptContext,
  ENTITLEMENT_GATED
};
