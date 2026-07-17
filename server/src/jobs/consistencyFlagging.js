// P4 · O7 — the nightly cross-facility consistency job (§9.3). Runs as SYSTEM,
// not as a user: no request, no session, no acting role.
//
//   npm --prefix server run job:consistency
//
// Render cron invokes it nightly after midnight UTC. This file does NOT build a
// scheduler (the plan is explicit) — the cron setup is documented in SESSION_LOG.
//
// ── DB connection (F2 binding (b), 2026-07-04; wired 2026-07-16) ─────────────
// The job runs outside any request, so it sets no `app.current_facility_ids` GUC
// and RLS default-denies it every facility-scoped table — including the
// facility_entitlements read that decides which facilities to cluster, and the
// operator-scoped ai_call_log/ai_budgets writes (those rows carry no facility_id,
// so there is no GUC to set even in principle). It therefore needs an RLS-exempt
// role and is deliberately NOT wrapped in runInFacilityScope.
//
// P2's non-owner switch ALREADY LANDED on staging (2026-07-03: DATABASE_URL →
// `vorge_app`). Running this job on that connection would find 0 entitled
// facilities, log "skipped", and exit 0 — a green cron doing nothing, nightly.
// So: `CONSISTENCY_JOB_DATABASE_URL` supplies the elevated connection, and
// assertRlsExempt() FAILS LOUDLY at startup when the role cannot bypass RLS.
// Unset falls back to DATABASE_URL, which is correct for local dev (owner).
//
// ── Entitlement (F2 resolution 1, 2026-07-04) ────────────────────────────────
// consistency_flagging is the one gated feature allowed to run operator-scoped,
// because facility_entitlements has no operator scope to check. The gate is HERE:
// listEntitledFacilities selects ONLY entitled facilities into the portfolio, so
// a non-entitled facility's data never reaches a cluster, a peer norm, or a
// prompt. There is no second gate downstream — this query IS the enforcement.
const knex = require("knex");
const db = require("../db/knex");
const env = require("../config/env");
const { runAiCall, buildOperatorPromptContext } = require("../ai");
const { findOutliers, clusterKeyFor } = require("../services/consistencyService");
const { buildConsistencyPrompt } = require("../ai/prompts/consistencyFlagging");
const {
  listEntitledFacilities,
  loadPortfolioRows,
  upsertFlag,
  expirePendingFlags
} = require("../repositories/consistencyRepository");

// Opens the job's own elevated pool when CONSISTENCY_JOB_DATABASE_URL is set;
// otherwise reuses the app's base pool (local dev, where it is the owner). The
// caller owns destroying whatever this returns — `ownsConnection` says whether
// there is a separate pool to close.
function openJobConnection() {
  if (!env.consistencyJobDatabaseUrl) {
    return { conn: db, ownsConnection: false };
  }
  return {
    conn: knex({
      client: "pg",
      connection: {
        connectionString: env.consistencyJobDatabaseUrl,
        ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
      },
      pool: { min: 0, max: 2 }
    }),
    ownsConnection: true
  };
}

// The guard that makes a misconfigured cron IMPOSSIBLE TO MISS. A non-exempt
// role does not error on its own — RLS simply returns no rows, so the job would
// report "0 entitled facilities" forever. Postgres exempts a role from RLS two
// ways: it OWNS the table (we deliberately do not FORCE RLS, so ownership
// bypasses), or it has the BYPASSRLS attribute. Anything else is a
// misconfiguration and must stop the run.
async function assertRlsExempt(conn) {
  const { rows } = await conn.raw(`
    SELECT current_user AS role,
           COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypass_rls,
           (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'facility_entitlements') AS owner
  `);
  const { role, bypass_rls: bypassRls, owner } = rows[0];

  if (role === owner || bypassRls === true) {
    return;
  }

  throw new Error(
    `[consistency] refusing to run: DB role "${role}" is not RLS-exempt (facility_entitlements owner is "${owner}").\n` +
      `Row-level security would hide every entitled facility and this job would silently flag nothing.\n` +
      `Set CONSISTENCY_JOB_DATABASE_URL to an owner/BYPASSRLS connection (see SESSION_LOG 2026-07-16, O7 "DB CONNECTION").`
  );
}

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
  // prompt and let the model contrast against an incomplete peer set. Unrated
  // rows (rating null) are excluded exactly as the statistics excluded them.
  const clusterRows = rows.filter(
    (r) =>
      r.rating !== null &&
      clusterKeyFor({ threatType: r.threatType, assetClass: r.assetClass }) === flag.clusterKey
  );
  const subject = clusterRows.find((r) => r.evaluationId === flag.evaluationId);

  // One peer entry per FACILITY (its cluster mean + a representative scenario),
  // matching how the statistics counted peers — the prompt tells the model how
  // many peer facilities there are, and a facility with three evaluations in the
  // cluster must not read as three peers or the stored rationale asserts wrong
  // counts to HQ ("5 of 7 peers…").
  const peersByFacility = new Map();
  for (const r of clusterRows) {
    if (r.facilityId === flag.facilityId) {
      continue;
    }
    if (!peersByFacility.has(r.facilityId)) {
      peersByFacility.set(r.facilityId, { facilityName: r.facilityName, ratings: [], scenario: r.scenario });
    }
    peersByFacility.get(r.facilityId).ratings.push(r.rating);
  }
  const peers = [...peersByFacility.values()].map((p) => ({
    facilityName: p.facilityName,
    rating: Math.round((p.ratings.reduce((s, v) => s + v, 0) / p.ratings.length) * 10) / 10,
    scenario: p.scenario
  }));

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
// against its own connection/clock. The RLS-exemption assertion runs for EVERY
// caller, including tests — a suite driving this on a non-exempt connection is
// itself a bug worth failing on.
async function runConsistencyFlagging({ conn = db, now = new Date() } = {}) {
  await assertRlsExempt(conn);

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
  const { conn, ownsConnection } = openJobConnection();
  console.log(
    `[consistency] connection: ${env.consistencyJobDatabaseUrl ? "CONSISTENCY_JOB_DATABASE_URL" : "DATABASE_URL (fallback — local/owner only)"}`
  );
  let summaries;
  try {
    summaries = await runConsistencyFlagging({ conn });
  } finally {
    if (ownsConnection) {
      await conn.destroy();
    }
  }
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
