// P4 · O2 — PURE budget logic for the AI module. No DB, no gateway, no clock
// side effects (the caller passes `now`). All the branching lives here so the
// 95% services coverage gate exercises the ceiling boundaries directly.
//
// Ceilings (businesslogic §9 / §19.11):
//   <80%  → proceed, no alert
//   ≥80%  → soft alert ONCE per scope per month, then proceed
//   ≥100% → refuse (cost_ceiling_hit); month rollover resumes automatically
//           because usage is summed within the current month only.

// Default monthly ceilings when a scope has no ai_budgets row.
const DEFAULT_MONTHLY_USD = Object.freeze({
  facility: 50,
  operator: 20
});

const SOFT_ALERT_FRACTION = 0.8;

// 'YYYY-MM' in UTC — the month bucket for usage accrual and the soft-alert
// once-per-month latch. UTC is deliberate (bind): a single global month key so
// accrual and rollover don't wobble with server timezone.
function monthKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function defaultMonthlyUsd(scope) {
  return DEFAULT_MONTHLY_USD[scope] ?? DEFAULT_MONTHLY_USD.facility;
}

// Cost from token counts using a per-model price table (USD per 1M tokens).
// Price lookup order: the (gateway-reported) `model`, then the requested
// `fallbackModel` (the config alias we ALWAYS have a price for — the gateway
// often reports a more specific/versioned id that isn't a table key), then
// prices.default so a genuinely unknown model never silently accrues $0.
// Rounded to the ai_call_log column scale (6 dp).
function computeCost({ model, fallbackModel, inputTokens = 0, outputTokens = 0, prices }) {
  const price =
    (prices && prices[model]) ||
    (prices && fallbackModel && prices[fallbackModel]) ||
    (prices && prices.default) ||
    { input: 0, output: 0 };
  const raw = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
  return Math.round(raw * 1e6) / 1e6;
}

// Decide what to do given month-to-date spend vs the ceiling. Returns a plain
// verdict; the orchestrator (src/ai/index.js) acts on it (refuse / alert-once /
// proceed) so this stays side-effect free.
function evaluateCeiling({ spentUsd, monthlyUsd, softAlertedForMonth, currentMonthKey }) {
  // A non-positive budget is treated as exhausted (never divide by zero).
  const pct = monthlyUsd > 0 ? spentUsd / monthlyUsd : Infinity;
  const exhausted = pct >= 1;
  const shouldAlert = !exhausted && pct >= SOFT_ALERT_FRACTION && softAlertedForMonth !== currentMonthKey;
  return { pct, exhausted, shouldAlert };
}

module.exports = {
  DEFAULT_MONTHLY_USD,
  SOFT_ALERT_FRACTION,
  monthKey,
  defaultMonthlyUsd,
  computeCost,
  evaluateCeiling
};
