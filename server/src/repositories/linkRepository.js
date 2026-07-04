// P3 · (d) — Asset×threat link enable/disable (Section 5). PUT is idempotent:
// it upserts the (asset_id, threat_id) row (UNIQUE) and sets `enabled`. Both the
// asset and the threat must belong to this assessment, else 404. Runs inside the
// write-guard savepoint.
//
// P3 (g) follow-on: enabling a pair also AUTO-CREATES an empty evaluation row for
// it when none exists, and echoes the evaluation back in the result. Rationale:
// evaluations have no create endpoint (PATCH only), and Section 6 needs a
// server-backed row (with a real id) to edit the moment a cell is scoped. This
// mirrors the demo's "tick a cell → an evaluation appears" flow. Disabling never
// deletes the evaluation (a re-enable restores the author's work).
const crypto = require("crypto");
const { mapLink, mapEvaluation } = require("./assessmentRepository");
const { DomainError } = require("../services/domainError");

// Ensure an evaluation exists for (assessment, asset, threat). Returns
// { row, created } — created is false when one was already present.
async function ensureEvaluation({ assessment, assetId, threatId, trx }) {
  const existing = await trx("evaluations")
    .where({ assessment_id: assessment.id, asset_id: assetId, threat_id: threatId })
    .first();
  if (existing) return { row: existing, created: false };

  const [row] = await trx("evaluations")
    .insert({
      id: crypto.randomUUID(),
      facility_id: assessment.facilityId,
      assessment_id: assessment.id,
      asset_id: assetId,
      threat_id: threatId
      // scenario/controls/vulnerabilities/proposed_mitigation default "", r1/r2 default "{}"
    })
    .returning("*");
  return { row, created: true };
}

async function setAssetThreatLink({ assessment, assetId, threatId, enabled, trx }) {
  const asset = await trx("assets").where({ id: assetId, assessment_id: assessment.id }).first();
  const threat = await trx("threats").where({ id: threatId, assessment_id: assessment.id }).first();
  if (!asset || !threat) {
    throw new DomainError("Asset or threat not found in this assessment", 404, "LINK_TARGET_NOT_FOUND");
  }

  const existing = await trx("asset_threat_links")
    .where({ assessment_id: assessment.id, asset_id: assetId, threat_id: threatId })
    .first();

  let linkRow;
  let before;
  if (existing) {
    before = existing.enabled === true;
    if (before !== enabled) {
      await trx("asset_threat_links").where({ id: existing.id }).update({ enabled, updated_at: trx.fn.now() });
    }
    linkRow = await trx("asset_threat_links").where({ id: existing.id }).first();
  } else {
    before = null;
    linkRow = (
      await trx("asset_threat_links")
        .insert({
          id: crypto.randomUUID(),
          facility_id: assessment.facilityId,
          assessment_id: assessment.id,
          asset_id: assetId,
          threat_id: threatId,
          enabled
        })
        .returning("*")
    )[0];
  }

  // Scoping a pair seeds its evaluation so the client has a real row to PATCH.
  let evaluation = null;
  let evaluationCreated = false;
  if (enabled) {
    const ensured = await ensureEvaluation({ assessment, assetId, threatId, trx });
    evaluation = ensured.row;
    evaluationCreated = ensured.created;
  }

  return {
    entityId: linkRow.id,
    diff: { enabled: [before, enabled] },
    metadata: evaluationCreated ? { evaluationCreated: evaluation.id } : {},
    result: { link: mapLink(linkRow), evaluation: evaluation ? mapEvaluation(evaluation) : null }
  };
}

module.exports = { setAssetThreatLink };
