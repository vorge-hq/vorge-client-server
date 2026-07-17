// P4 · O7 — the nightly cross-facility consistency job (§9.3). Runs as SYSTEM,
// not as a user: no request, no session, no acting role.
//
//   npm --prefix server run job:consistency
//
// Render cron invokes it nightly after midnight UTC. This file does NOT build a
// scheduler (the plan is explicit) — the cron setup is documented in SESSION_LOG.
//
// ── DB connection (F2 binding (b), 2026-07-04) ────────────────────────────────
// The job reads/writes OPERATOR-scoped ai_call_log / ai_budgets rows, which the
// facility RLS predicate denies to the request-path app role BY DESIGN. So it
// runs on the base pool — the DB owner today, which is RLS-exempt — and is
// deliberately NOT wrapped in runInFacilityScope: an operator-scoped ai_call_log
// row carries no facility_id and therefore no GUC to set. When P2's non-owner
// switch lands, this job needs an explicitly documented elevated connection (its
// own env var) or it will silently write nothing.
//
// ── Entitlement (F2 resolution 1, 2026-07-04) ────────────────────────────────
// consistency_flagging is the one gated feature allowed to run operator-scoped,
// because facility_entitlements has no operator scope to check. The gate is HERE:
// listEntitledFacilities selects ONLY entitled facilities into the portfolio, so
// a non-entitled facility's data never reaches a cluster, a peer norm, or a
// prompt. There is no second gate downstream — this query IS the enforcement.
const db = require("../db/knex");
const { runAiCall, buildOperatorPromptContext } = require("../ai");
const { findOutliers, clusterKeyFor } = require("../services/consistencyService");
const { buildConsistencyPrompt } = require("../ai/prompts/consistencyFlagging");
const {
  listEntitledFacilities,
  loadPortfolioRows,
  upsertFlag,
  expirePendingFlags
} = require("../repositories/consistencyRepository");

// A portfolio needs peers to have a norm at all (consistencyService.MIN_PEERS + 1).
// Below it the job skips the operator entirely rather than spending a single
// token: §9.3's own framing — "a consultant operating 1 facility gets nothing
// from cross-facility flagging".
const MIN_PORTFOLIO_FACILITIES = 4;

// Generate the prose rationale for one outlier. Best-effort BY DESIGN: an AI
// failure must not cost HQ the divergence itself, which is the deterministic part
// and the actual finding. runAiCall has already written the ai_call_log row for
// whatever failed, so the failure is recorded, not swallowed — the flag simply
// stores a null rationale.
async function rationaleFor({ flag, rows, operatorId, traceId }) {
  // Match on the cluster KEY, not on the raw threat/asset strings: the key is
  // normalized (trim + lowercase), so "Maritime" and "maritime " cluster together
  // in the statistics. Filtering on raw text here would drop those peers from the
  // prompt and let the model contrast against an incomplete peer set.
  const clusterRows = rows.filter(
    (r) => clusterKeyFor({ threatType: r.threatType, assetClass: r.assetClass }) === flag.clusterKey
  );
  const subject = clusterRows.find((r) => r.evaluationId === flag.evaluationId);
  const peers = clusterRows
    .filter((r) => r.facilityId !== flag.facilityId)
    .map((r) => ({ facilityName: r.facilityName, rating: r.rating, scenario: r.scenario }));

  try {
    const { output } = await runAiCall({
      feature: "consistency_flagging",
      kind: "text",
      // operatorId ONLY (no facilityId): HQ budget scope, $20/mo default per
      // §19.11. Passing a facilityId would bill the facility and re-trigger the
      // per-facility entitlement check this job already enforced upstream.
      operatorId,
      userId: "system",
      actingRole: null,
      traceId,
      prompt: buildConsistencyPrompt({ flag, subject, peers })
    });
    return output;
  } catch (err) {
    console.error(`[consistency] rationale failed for ${flag.evaluationId}: ${err.message}`);
    return null;
  }
}

async function runForOperator({ operator, conn, now }) {
  const summary = { operatorId: operator.id, facilities: 0, flagged: 0, expired: 0, skipped: null };

  const facilities = await listEntitledFacilities({ operatorId: operator.id, conn });
  summary.facilities = facilities.length;

  if (facilities.length < MIN_PORTFOLIO_FACILITIES) {
    summary.skipped = `only ${facilities.length} entitled facilities (need ${MIN_PORTFOLIO_FACILITIES})`;
    // Expire first, THEN skip: an operator that drops below the floor (a facility
    // disabled, an entitlement lapsed) can no longer support any norm, so
    // yesterday's pending flags are unbacked. Returning without this would strand
    // them on the HQ dashboard forever — no later run could ever retire them.
    summary.expired = await expirePendingFlags({ operatorId: operator.id, keepFlagIds: [], conn });
    return summary;
  }

  // The §17.5 hard wall, asserted rather than assumed: facilities rows carry
  // operator_id, so this throws on any cross-operator row instead of letting it
  // reach a peer norm or a prompt.
  buildOperatorPromptContext({ operatorId: operator.id, facilities });

  const rows = await loadPortfolioRows({
    operatorId: operator.id,
    facilityIds: facilities.map((f) => f.id),
    conn
  });

  const outliers = findOutliers({ rows });
  const keepFlagIds = [];

  for (const flag of outliers) {
    const rationale = await rationaleFor({
      flag,
      rows,
      operatorId: operator.id,
      traceId: `consistency-${now.toISOString().slice(0, 10)}-${flag.evaluationId}`
    });
    const saved = await upsertFlag({
      flag: { ...flag, operatorId: operator.id, rationale },
      conn
    });
    keepFlagIds.push(saved.id);
    summary.flagged += 1;
  }

  summary.expired = await expirePendingFlags({ operatorId: operator.id, keepFlagIds, conn });
  return summary;
}

// `conn` and `now` are injectable so the integration suite can drive the job
// directly against its own transaction/clock without the process shell below.
async function runConsistencyFlagging({ conn = db, now = new Date() } = {}) {
  const operators = await conn("operators").select("id", "name").orderBy("name");
  const summaries = [];

  for (const operator of operators) {
    try {
      summaries.push(await runForOperator({ operator, conn, now }));
    } catch (err) {
      // One operator's bad data must never abort the rest of the portfolio.
      console.error(`[consistency] operator ${operator.name} failed: ${err.message}`);
      summaries.push({ operatorId: operator.id, error: err.message });
    }
  }

  return summaries;
}

async function main() {
  const summaries = await runConsistencyFlagging();
  for (const s of summaries) {
    if (s.error) {
      console.error(`[consistency] ${s.operatorId} — ERROR ${s.error}`);
    } else if (s.skipped) {
      console.log(`[consistency] ${s.operatorId} — skipped: ${s.skipped}`);
    } else {
      console.log(
        `[consistency] ${s.operatorId} — ${s.facilities} facilities, ${s.flagged} flagged, ${s.expired} expired`
      );
    }
  }
}

// Importable for tests; executable as the cron entry point.
if (require.main === module) {
  main()
    .then(() => db.destroy())
    .catch(async (err) => {
      console.error(err);
      await db.destroy();
      process.exit(1);
    });
}

module.exports = { runConsistencyFlagging, MIN_PORTFOLIO_FACILITIES };
