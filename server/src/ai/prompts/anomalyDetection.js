// P4 · O6 — the anomaly-detection prompt (§9.2): the LLM half of the hybrid
// engine. The deterministic half (services/anomalyRulesService.js) has already
// run for free by the time this prompt fires; this covers only the two checks
// that need judgement about MEANING and therefore cannot be expressed as a rule:
//
//   scenario-threat-mismatch      — the scenario text describes a different
//                                   threat type than the linked threat
//                                   (e.g. a pirate boarding filed under civil unrest)
//   mitigation-vulnerability-gap  — the proposed mitigation does not address the
//                                   stated vulnerabilities
//
// No SDK import here (zod only), so the aiImportBoundary scan is unaffected.
//
// The prompt is written for RECALL-OVER-PRECISION INVERSION on purpose: §9.2
// binds a 10-20% dismissal rate and "better to under-flag than over-flag", so it
// tells the model to stay silent unless the mismatch is obvious. Only the two
// rule keys below are accepted; anything else the model invents is discarded by
// the route, the same way out-of-vocab tags are in O4.
const { z } = require("zod");

const LLM_RULE_KEYS = Object.freeze({
  SCENARIO_THREAT_MISMATCH: "scenario-threat-mismatch",
  MITIGATION_VULNERABILITY_GAP: "mitigation-vulnerability-gap"
});

// Structured-output contract. `evaluationId` is echoed back from the prompt so a
// flag can be attached to the right Section 6 row; the route drops any id it did
// not send and any rule key outside the enum. max(20) is a runaway guard, not a
// target — the prompt asks for the confident few.
const ANOMALY_OUTPUT_SCHEMA = z.object({
  flags: z
    .array(
      z.object({
        evaluationId: z.string(),
        ruleKey: z.enum([LLM_RULE_KEYS.SCENARIO_THREAT_MISMATCH, LLM_RULE_KEYS.MITIGATION_VULNERABILITY_GAP]),
        message: z.string().max(240)
      })
    )
    .max(20)
});

function truncate(text, max = 600) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// One compact block per evaluation. Only the fields the two checks need are sent
// — no facility identifiers, no user data, no narrative sections (§9.7: keep the
// call small and free of anything the check does not read).
function describeEvaluation({ evaluation, asset, threat }) {
  return [
    `evaluationId: ${evaluation.id}`,
    `asset: ${(asset && asset.name) || "unknown"}`,
    `threat: ${(threat && threat.name) || "unknown"}`,
    `threat type: ${(threat && threat.details && threat.details.classification) || "unspecified"}`,
    `scenario: ${truncate(evaluation.scenario)}`,
    `vulnerabilities: ${truncate(evaluation.vulnerabilities)}`,
    `proposed mitigation: ${truncate(evaluation.proposedMitigation)}`
  ].join("\n");
}

function buildAnomalyPrompt({ evaluations = [], assets = [], threats = [] }) {
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const threatsById = new Map(threats.map((t) => [t.id, t]));

  const blocks = evaluations.map((evaluation) =>
    describeEvaluation({
      evaluation,
      asset: assetsById.get(evaluation.assetId),
      threat: threatsById.get(evaluation.threatId)
    })
  );

  return [
    "You are reviewing rows of a Security Risk Assessment for likely data-entry mistakes.",
    "",
    "Check each row for exactly two problems:",
    `1. ${LLM_RULE_KEYS.SCENARIO_THREAT_MISMATCH}: the scenario describes a different kind of threat than the`,
    "   threat/threat type it is filed under.",
    `2. ${LLM_RULE_KEYS.MITIGATION_VULNERABILITY_GAP}: the proposed mitigation does not address the stated`,
    "   vulnerabilities at all.",
    "",
    "Rules you must follow:",
    "- Flag ONLY an obvious mismatch that an assessor would agree is a mistake. When in doubt, say nothing.",
    "- A partially-addressed vulnerability, a terse entry, or a stylistic difference is NOT a flag.",
    "- Skip any row with empty or placeholder text rather than flagging it.",
    "- Never flag anything about ratings, criticality or scoring — those are checked elsewhere.",
    "- Each message: one sentence, plain English, naming what looks wrong. No preamble, no advice to 'review'.",
    "- Return {\"flags\": []} when nothing is clearly wrong. That is the expected answer for most assessments.",
    "",
    "Rows:",
    "",
    blocks.join("\n\n")
  ].join("\n");
}

module.exports = { ANOMALY_OUTPUT_SCHEMA, LLM_RULE_KEYS, buildAnomalyPrompt };
