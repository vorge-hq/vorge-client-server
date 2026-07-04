// P3 · (d) — Threat content writes (Section 4). Mirrors assetRepository: runs
// inside the write-guard savepoint, returns { entityId, diff, result } with a
// changed-fields-only diff. lock_version/audit are the guard's job.
const crypto = require("crypto");
const { mapThreat } = require("./assessmentRepository");
const { DomainError } = require("../services/domainError");

function detailsChanged(before, after) {
  return JSON.stringify(before || {}) !== JSON.stringify(after || {});
}

async function loadThreatInAssessment({ threatId, assessmentId, trx }) {
  const row = await trx("threats").where({ id: threatId, assessment_id: assessmentId }).first();
  return row ? mapThreat(row) : null;
}

async function createThreatForAssessment({ assessment, input, trx }) {
  const [row] = await trx("threats")
    .insert({
      id: crypto.randomUUID(),
      facility_id: assessment.facilityId,
      assessment_id: assessment.id,
      name: input.name,
      likelihood: input.likelihood ?? null,
      details: JSON.stringify(input.details ?? {})
    })
    .returning("*");

  const threat = mapThreat(row);
  const diff = {
    name: [null, threat.name],
    likelihood: [null, threat.likelihood],
    details: [null, threat.details]
  };
  return { entityId: threat.id, diff, result: threat };
}

async function updateThreatInAssessment({ assessment, threatId, input, trx }) {
  const existing = await loadThreatInAssessment({ threatId, assessmentId: assessment.id, trx });
  if (!existing) {
    throw new DomainError("Threat not found in this assessment", 404, "THREAT_NOT_FOUND");
  }

  const changes = {};
  const diff = {};
  if (input.name !== undefined && input.name !== existing.name) {
    changes.name = input.name;
    diff.name = [existing.name, input.name];
  }
  if (input.likelihood !== undefined && input.likelihood !== existing.likelihood) {
    changes.likelihood = input.likelihood;
    diff.likelihood = [existing.likelihood, input.likelihood];
  }
  if (input.details !== undefined && detailsChanged(existing.details, input.details)) {
    changes.details = JSON.stringify(input.details);
    diff.details = [existing.details, input.details];
  }

  let threat = existing;
  if (Object.keys(changes).length > 0) {
    changes.updated_at = trx.fn.now();
    const [row] = await trx("threats").where({ id: threatId }).update(changes).returning("*");
    threat = mapThreat(row);
  }

  return { entityId: threatId, diff, result: threat };
}

async function deleteThreatFromAssessment({ assessment, threatId, trx }) {
  const existing = await loadThreatInAssessment({ threatId, assessmentId: assessment.id, trx });
  if (!existing) {
    throw new DomainError("Threat not found in this assessment", 404, "THREAT_NOT_FOUND");
  }
  await trx("threats").where({ id: threatId }).del();
  return { entityId: threatId, diff: { deleted: [existing, null] }, result: { id: threatId, deleted: true } };
}

module.exports = {
  loadThreatInAssessment,
  createThreatForAssessment,
  updateThreatInAssessment,
  deleteThreatFromAssessment
};
