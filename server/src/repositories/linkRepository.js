// P3 · (d) — Asset×threat link enable/disable (Section 5). PUT is idempotent:
// it upserts the (asset_id, threat_id) row (UNIQUE) and sets `enabled`. Both the
// asset and the threat must belong to this assessment, else 404. Runs inside the
// write-guard savepoint.
const crypto = require("crypto");
const { mapLink } = require("./assessmentRepository");
const { DomainError } = require("../services/domainError");

async function setAssetThreatLink({ assessment, assetId, threatId, enabled, trx }) {
  const asset = await trx("assets").where({ id: assetId, assessment_id: assessment.id }).first();
  const threat = await trx("threats").where({ id: threatId, assessment_id: assessment.id }).first();
  if (!asset || !threat) {
    throw new DomainError("Asset or threat not found in this assessment", 404, "LINK_TARGET_NOT_FOUND");
  }

  const existing = await trx("asset_threat_links")
    .where({ assessment_id: assessment.id, asset_id: assetId, threat_id: threatId })
    .first();

  if (existing) {
    const before = existing.enabled === true;
    if (before !== enabled) {
      await trx("asset_threat_links").where({ id: existing.id }).update({ enabled, updated_at: trx.fn.now() });
    }
    const row = await trx("asset_threat_links").where({ id: existing.id }).first();
    return { entityId: existing.id, diff: { enabled: [before, enabled] }, result: mapLink(row) };
  }

  const id = crypto.randomUUID();
  const [row] = await trx("asset_threat_links")
    .insert({
      id,
      facility_id: assessment.facilityId,
      assessment_id: assessment.id,
      asset_id: assetId,
      threat_id: threatId,
      enabled
    })
    .returning("*");
  return { entityId: id, diff: { enabled: [null, enabled] }, result: mapLink(row) };
}

module.exports = { setAssetThreatLink };
