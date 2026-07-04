// P3 · (d) — Evaluation edits (Section 6: scenario, controls, vulnerabilities,
// proposed mitigation, R1/R2 risk objects). PATCH only — evaluation rows are
// created alongside links, not by the client. Runs inside the write-guard
// savepoint; changed-fields-only diff.
const { mapEvaluation } = require("./assessmentRepository");
const { DomainError } = require("../services/domainError");

// Text fields compared by identity; r1/r2 are jsonb objects compared by value.
const TEXT_FIELDS = [
  ["scenario", "scenario"],
  ["controls", "controls"],
  ["vulnerabilities", "vulnerabilities"],
  ["proposedMitigation", "proposed_mitigation"]
];
const JSON_FIELDS = [
  ["r1", "r1"],
  ["r2", "r2"]
];

function jsonChanged(before, after) {
  return JSON.stringify(before || {}) !== JSON.stringify(after || {});
}

async function updateEvaluationInAssessment({ assessment, evaluationId, input, trx }) {
  const row = await trx("evaluations").where({ id: evaluationId, assessment_id: assessment.id }).first();
  if (!row) {
    throw new DomainError("Evaluation not found in this assessment", 404, "EVALUATION_NOT_FOUND");
  }
  const existing = mapEvaluation(row);

  const changes = {};
  const diff = {};
  for (const [apiKey, col] of TEXT_FIELDS) {
    if (input[apiKey] !== undefined && input[apiKey] !== existing[apiKey]) {
      changes[col] = input[apiKey];
      diff[apiKey] = [existing[apiKey], input[apiKey]];
    }
  }
  for (const [apiKey, col] of JSON_FIELDS) {
    if (input[apiKey] !== undefined && jsonChanged(existing[apiKey], input[apiKey])) {
      changes[col] = JSON.stringify(input[apiKey]);
      diff[apiKey] = [existing[apiKey], input[apiKey]];
    }
  }

  let evaluation = existing;
  if (Object.keys(changes).length > 0) {
    changes.updated_at = trx.fn.now();
    const [updated] = await trx("evaluations").where({ id: evaluationId }).update(changes).returning("*");
    evaluation = mapEvaluation(updated);
  }

  return { entityId: evaluationId, diff, result: evaluation };
}

module.exports = { updateEvaluationInAssessment };
