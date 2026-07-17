// P4 · O7 — consistency_flags persistence + the portfolio read the nightly job
// clusters over (§9.3).
//
// TWO CALLER CLASSES, deliberately different:
//   - The nightly job (out of request, base pool = owner today) calls
//     listEntitledFacilities / loadPortfolioRows / upsertFlag / expirePendingFlags.
//     F2 binding (b) 2026-07-04: operator-scoped work is reachable ONLY from the
//     job/platform context, because facility RLS denies it to the request-path
//     app role BY DESIGN. Pass `conn` explicitly from the job.
//   - The HQ read path (in request, RLS-scoped) calls listFlagsForUser /
//     getFlagForUser / updateFlagStatus, which scope in SQL by the caller's
//     §17.5 operator portfolio — the same OR-over-both-id-sets shape as
//     listAssessmentsForUser, default-denying on an empty scope.
const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");
const { facilityScopeFor } = require("../services/facilityAccessService");

function mapFlag(row) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    facilityId: row.facility_id,
    facilityName: row.facility_name || null,
    assessmentId: row.assessment_id,
    evaluationId: row.evaluation_id,
    clusterKey: row.cluster_key,
    severity: row.severity,
    divergenceSigma: Number(row.divergence_sigma),
    rationale: row.rationale || null,
    status: row.status,
    dismissedReason: row.dismissed_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// The facilities of one operator with consistency_flagging ENABLED. This is
// where the entitlement is enforced for the whole feature (F2 resolution
// 2026-07-04: there is no per-facility check at an operator-scoped runAiCall, so
// a non-entitled facility must never enter a cluster — its data would otherwise
// reach the prompt and the peer norm).
async function listEntitledFacilities({ operatorId, conn = activeConn() }) {
  const rows = await conn("facilities as f")
    .join("facility_entitlements as e", "e.facility_id", "f.id")
    .where("f.operator_id", operatorId)
    .andWhere("e.feature_key", "consistency_flagging")
    .andWhere("e.enabled", true)
    .orderBy("f.name")
    .select("f.id", "f.name", "f.operator_id");
  return rows.map((r) => ({ id: r.id, name: r.name, operatorId: r.operator_id }));
}

// One row per evaluation to cluster: the rating is R1's consequence x likelihood
// (the same product the client derives; the DB stores only the axes).
//
// LATEST assessment per facility only (bake-in, SESSION_LOG): §9.3 compares "each
// facility's risk ratings" — its current picture. Including superseded years
// would let a facility's own history act as its peers and drag the norm.
// Assessment state is NOT filtered: a Draft is the live picture, and §9.3's
// "send back to Author" action presumes flags can land on editable assessments.
//
// DISTINCT ON, not MAX(created_at) + a join back on equality: Postgres now() is
// the TRANSACTION timestamp, so assessments inserted together (db/seed.js writes
// a facility's 2026 and 2025 SRAs in one transaction; O8 provisioning will do the
// same) share a created_at to the microsecond. An equality join then matches BOTH
// and silently blends two years of ratings into one facility's mean. DISTINCT ON
// picks exactly one row per facility, with id as a deterministic tiebreak.
async function loadPortfolioRows({ operatorId, facilityIds, conn = activeConn() }) {
  if (!facilityIds || facilityIds.length === 0) {
    return [];
  }

  const latest = conn
    .select("id", "facility_id")
    .from("assessments")
    .whereIn("facility_id", facilityIds)
    .andWhere("operator_id", operatorId)
    .distinctOn("facility_id")
    .orderBy([
      { column: "facility_id" },
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" }
    ]);

  const rows = await conn("evaluations as e")
    .join("assessments as a", "a.id", "e.assessment_id")
    .join(conn.raw("(?) as latest", [latest]), function joinLatest() {
      this.on("latest.id", "=", "a.id");
    })
    .join("assets as asset", "asset.id", "e.asset_id")
    .join("threats as t", "t.id", "e.threat_id")
    .join("facilities as f", "f.id", "a.facility_id")
    .whereIn("a.facility_id", facilityIds)
    .andWhere("a.operator_id", operatorId)
    .select(
      "e.id as evaluation_id",
      "e.scenario",
      "e.vulnerabilities",
      "e.r1",
      "a.id as assessment_id",
      "a.facility_id",
      "a.operator_id",
      "f.name as facility_name",
      "asset.asset_type",
      "t.name as threat_name",
      "t.details as threat_details"
    );

  return rows.map((row) => {
    const r1 = row.r1 || {};
    const consequence = Number(r1.consequence);
    const likelihood = Number(r1.likelihood);
    const rating = Number.isFinite(consequence) && Number.isFinite(likelihood) ? consequence * likelihood : null;
    const details = row.threat_details || {};
    // Cluster key source, DECIDED 2026-07-16: the free-text `classification`
    // (what §19.1's vocabulary is meant to populate), falling back to the threat
    // `name` column when a facility left it blank.
    const classification = String(details.classification || "").trim();
    return {
      evaluationId: row.evaluation_id,
      assessmentId: row.assessment_id,
      facilityId: row.facility_id,
      operatorId: row.operator_id,
      facilityName: row.facility_name,
      threatType: classification || row.threat_name,
      assetClass: row.asset_type,
      scenario: row.scenario,
      vulnerabilities: row.vulnerabilities,
      rating
    };
  });
}

// Upsert on the natural key (evaluation, cluster). The nightly re-run refreshes
// the statistics and the rationale but NEVER resets `status` or
// `dismissed_reason`: an HQ Executive's dismissal is a human decision and must
// survive tonight's job. `updated_at` moves so the read surface can show that a
// dismissed divergence is still live.
async function upsertFlag({ flag, conn = activeConn() }) {
  const [row] = await conn("consistency_flags")
    .insert({
      id: crypto.randomUUID(),
      operator_id: flag.operatorId,
      facility_id: flag.facilityId,
      assessment_id: flag.assessmentId,
      evaluation_id: flag.evaluationId,
      cluster_key: flag.clusterKey,
      severity: flag.severity,
      divergence_sigma: flag.divergenceSigma,
      rationale: flag.rationale || null,
      status: "pending"
    })
    .onConflict(["evaluation_id", "cluster_key"])
    .merge({
      severity: flag.severity,
      divergence_sigma: flag.divergenceSigma,
      rationale: flag.rationale || null,
      updated_at: conn.fn.now()
    })
    .returning("*");
  return mapFlag(row);
}

// §9.3's `expired` lifecycle state: a PENDING flag the latest run no longer
// raises means the divergence is gone (re-rated, or peers moved). Only pending
// rows expire — a dismissed or sent-back flag keeps its human-set status as the
// record of what was decided.
async function expirePendingFlags({ operatorId, keepFlagIds = [], conn = activeConn() }) {
  const query = conn("consistency_flags").where({ operator_id: operatorId, status: "pending" });
  if (keepFlagIds.length > 0) {
    query.whereNotIn("id", keepFlagIds);
  }
  return query.update({ status: "expired", updated_at: conn.fn.now() });
}

// §17.5 operator-portfolio scope, enforced IN SQL (not fetch-then-filter): an HQ
// Executive's operator ids match the flag's operator_id; a facility-scoped role's
// ids match facility_id. No scope → no rows (default deny), never all rows.
function scopedFlagsQuery({ user, actingRole, conn }) {
  const { facilityIds, operatorIds } = facilityScopeFor({ user, actingRole });
  if (facilityIds.length === 0 && operatorIds.length === 0) {
    return null;
  }
  return conn("consistency_flags as c")
    .join("facilities as f", "f.id", "c.facility_id")
    .where((builder) => {
      if (facilityIds.length > 0) {
        builder.orWhereIn("c.facility_id", facilityIds);
      }
      if (operatorIds.length > 0) {
        builder.orWhereIn("c.operator_id", operatorIds);
      }
    });
}

async function listFlagsForUser({ user, actingRole, status, conn = activeConn() }) {
  const query = scopedFlagsQuery({ user, actingRole, conn });
  if (!query) {
    return [];
  }
  if (status) {
    query.andWhere("c.status", status);
  }
  const rows = await query
    .orderBy("c.divergence_sigma", "desc")
    .select("c.*", "f.name as facility_name");
  return rows.map(mapFlag);
}

// Scoped getter → null for an out-of-portfolio flag, so the route answers 404
// without leaking that it exists (the repo-scoped pattern).
async function getFlagForUser({ flagId, user, actingRole, conn = activeConn() }) {
  const query = scopedFlagsQuery({ user, actingRole, conn });
  if (!query) {
    return null;
  }
  const row = await query.andWhere("c.id", flagId).select("c.*", "f.name as facility_name").first();
  return row ? mapFlag(row) : null;
}

async function updateFlagStatus({ flagId, status, dismissedReason = null, userId, trx }) {
  const [row] = await trx("consistency_flags")
    .where({ id: flagId })
    .update({
      status,
      dismissed_reason: dismissedReason,
      dismissed_by: userId || null,
      updated_at: trx.fn.now()
    })
    .returning("*");
  return row ? mapFlag(row) : null;
}

module.exports = {
  mapFlag,
  listEntitledFacilities,
  loadPortfolioRows,
  upsertFlag,
  expirePendingFlags,
  listFlagsForUser,
  getFlagForUser,
  updateFlagStatus
};
