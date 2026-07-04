// P3 · (c) — Asset content writes (the REFERENCE endpoint every other content
// entity copies). These run INSIDE the write-guard's savepoint (trx is always
// passed), so they never open their own transaction and never touch
// lock_version/audit — that is the guard's job. Each returns the
// { entityId, diff, result } the guard needs: `diff` is before/after of changed
// fields only, matching the workflow route's [before, after] shape.
const crypto = require("crypto");
const { mapAsset } = require("./assessmentRepository");
const { DomainError } = require("../services/domainError");

function detailsChanged(before, after) {
  return JSON.stringify(before || {}) !== JSON.stringify(after || {});
}

async function loadAssetInAssessment({ assetId, assessmentId, trx }) {
  const row = await trx("assets").where({ id: assetId, assessment_id: assessmentId }).first();
  return row ? mapAsset(row) : null;
}

async function createAssetForAssessment({ assessment, input, trx }) {
  const id = crypto.randomUUID();
  const [row] = await trx("assets")
    .insert({
      id,
      facility_id: assessment.facilityId,
      assessment_id: assessment.id,
      name: input.name,
      asset_type: input.assetType ?? null,
      criticality: input.criticality ?? null,
      details: JSON.stringify(input.details ?? {})
    })
    .returning("*");

  const asset = mapAsset(row);
  // A create is a change of every field from nothing (null) to its new value.
  const diff = {
    name: [null, asset.name],
    assetType: [null, asset.assetType],
    criticality: [null, asset.criticality],
    details: [null, asset.details]
  };
  return { entityId: asset.id, diff, result: asset };
}

async function updateAssetInAssessment({ assessment, assetId, input, trx }) {
  const existing = await loadAssetInAssessment({ assetId, assessmentId: assessment.id, trx });
  if (!existing) {
    throw new DomainError("Asset not found in this assessment", 404, "ASSET_NOT_FOUND");
  }

  const changes = {};
  const diff = {};
  if (input.name !== undefined && input.name !== existing.name) {
    changes.name = input.name;
    diff.name = [existing.name, input.name];
  }
  if (input.assetType !== undefined && input.assetType !== existing.assetType) {
    changes.asset_type = input.assetType;
    diff.assetType = [existing.assetType, input.assetType];
  }
  if (input.criticality !== undefined && input.criticality !== existing.criticality) {
    changes.criticality = input.criticality;
    diff.criticality = [existing.criticality, input.criticality];
  }
  if (input.details !== undefined && detailsChanged(existing.details, input.details)) {
    changes.details = JSON.stringify(input.details);
    diff.details = [existing.details, input.details];
  }

  // No-op edits still bump lock_version + write an audit row (the guard already
  // did the bump); we skip only the SQL UPDATE when nothing changed.
  let asset = existing;
  if (Object.keys(changes).length > 0) {
    changes.updated_at = trx.fn.now();
    const [row] = await trx("assets").where({ id: assetId }).update(changes).returning("*");
    asset = mapAsset(row);
  }

  return { entityId: assetId, diff, result: asset };
}

async function deleteAssetFromAssessment({ assessment, assetId, trx }) {
  const existing = await loadAssetInAssessment({ assetId, assessmentId: assessment.id, trx });
  if (!existing) {
    throw new DomainError("Asset not found in this assessment", 404, "ASSET_NOT_FOUND");
  }

  await trx("assets").where({ id: assetId }).del();

  const diff = { deleted: [existing, null] };
  return { entityId: assetId, diff, result: { id: assetId, deleted: true } };
}

module.exports = {
  loadAssetInAssessment,
  createAssetForAssessment,
  updateAssetInAssessment,
  deleteAssetFromAssessment
};
