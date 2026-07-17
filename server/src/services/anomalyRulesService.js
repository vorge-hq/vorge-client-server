// P4 · O6 — the deterministic half of the hybrid anomaly engine (§9.2).
//
// PURE — no DB, no AI, no I/O, no clock. Given the assessment's already-loaded
// entities it returns advisory flags. The 95% services coverage gate applies:
// all branching lives here, the route stays a thin caller.
//
// These rules run FIRST and FREE on every anomaly-check; the LLM contextual
// checks (scenario-vs-threat-type, mitigation-vs-vulnerability) run after, in
// src/ai/prompts/anomalyDetection.js. Both halves are gated by the same
// `anomaly_detection` entitlement — the whole feature is the add-on.
//
// Tuning posture (§9.2, binding): "Better to under-flag than over-flag." A noisy
// engine trains Authors to ignore every warning. So every rule below refuses to
// fire on incomplete data rather than guessing: a missing criticality, an absent
// consequences narrative, or an R1 without both axis values yields NO flag.
//
// Flags are never persisted — they are recomputed each check and matched against
// anomaly_acknowledgements to decide what the Author still sees.

// Rule keys are the stable contract with the client (chip identity) and with
// anomaly_acknowledgements.rule_key. NEVER rename one without a data migration:
// a renamed key silently resurrects every Author's dismissed flags.
//
// ASSET_CRITICALITY_CONSEQUENCES keeps the id the AD-1 client loop shipped with
// on 2026-05-29 (client/src/features/assessmentWorkspace/useAnomalyAcknowledgement.js)
// so the existing chip/ack UI contract carries over unchanged.
const RULE_KEYS = Object.freeze({
  ASSET_CRITICALITY_CONSEQUENCES: "asset-criticality-consequences",
  SEVERITY_VS_CRITICALITY: "severity-vs-criticality",
  R1_MATH_CONSISTENCY: "r1-math-consistency"
});

// Words in a consequences narrative that describe an outcome no Low/Medium
// criticality asset should have. Kept deliberately short: each addition is a new
// false-positive surface. Mirrors the AD-1 client list (client/src/data/assets.js).
const SEVERE_KEYWORDS = Object.freeze([
  "fatal",
  "fatality",
  "death",
  "kill",
  "major",
  "massive",
  "catastrophic",
  "severe",
  "environmental",
  "shutdown",
  "safety"
]);

// Criticality values the Author can pick (client asset form): Low | Medium |
// High | Very High. Only the bottom two can contradict a severe consequence.
const LOW_CRITICALITY = Object.freeze(["Low", "Medium"]);

// The 5x5 matrix's top consequence value — "Massive" in §19's scale.
const MASSIVE_CONSEQUENCE = 5;

function flag({ ruleKey, entityType, entityId, message }) {
  return { ruleKey, entityType, entityId, message };
}

function severeKeywordsIn(text) {
  if (!text) {
    return [];
  }
  const haystack = String(text).toLowerCase();
  return SEVERE_KEYWORDS.filter((word) => haystack.includes(word));
}

// A 1-5 matrix axis value. Anything else (null, "", 2.5, 7) is not a rating we
// can do arithmetic on.
function axisValue(raw) {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isInteger(n)) {
    return null;
  }
  return n;
}

// §9.2: "Asset criticality marked Low while consequences mention fatality or
// major environmental release." Fires on the asset, so the chip lands next to
// the Section 3 consequences field the Author is typing in.
function assetCriticalityVsConsequences(asset) {
  const consequences = (asset.details && asset.details.consequences) || "";
  if (!asset.criticality || !consequences) {
    return null;
  }
  if (!LOW_CRITICALITY.includes(asset.criticality)) {
    return null;
  }
  const matched = severeKeywordsIn(consequences);
  if (matched.length === 0) {
    return null;
  }
  return flag({
    ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
    entityType: "asset",
    entityId: asset.id,
    message: `Criticality marked ${asset.criticality}, but consequences mention "${matched
      .slice(0, 2)
      .join('", "')}". Consider raising.`
  });
}

// §9.2: "Severity ratings inconsistent with asset criticality (e.g., a Massive
// consequence on a Low-criticality asset)." Only the sharpest contradiction
// fires — the top consequence value against the bottom criticality — because
// every softer pairing (4-vs-Medium and friends) is defensible in a real SRA and
// would be noise.
function severityVsCriticality({ evaluation, asset }) {
  if (!asset || !asset.criticality) {
    return null;
  }
  const consequence = axisValue(evaluation.r1 && evaluation.r1.consequence);
  if (consequence !== MASSIVE_CONSEQUENCE || asset.criticality !== "Low") {
    return null;
  }
  return flag({
    ruleKey: RULE_KEYS.SEVERITY_VS_CRITICALITY,
    entityType: "evaluation",
    entityId: evaluation.id,
    message: `R1 consequence is rated ${MASSIVE_CONSEQUENCE} (the highest) but "${asset.name}" is marked Low criticality. One of the two is likely wrong.`
  });
}

// §9.2: "Rating math that does not add up (R1 inconsistent with severity x
// likelihood inputs)."
//
// Two ways the arithmetic can be wrong:
//   (a) a stored r1.score that is not consequence x likelihood — a stale score
//       left behind when an axis was edited (imports and older clients carry a
//       score; the current client derives it, so this normally cannot fire), and
//   (b) an axis value outside the 1-5 matrix.
// A consequence of 0 is the matrix's explicit "no consequence" (see
// riskMatrixService) — legal, and it makes the score N/A, so nothing is checked.
// No score and no axis values -> nothing to verify -> no flag.
function r1MathConsistency(evaluation) {
  const r1 = evaluation.r1 || {};
  const consequence = axisValue(r1.consequence);
  const likelihood = axisValue(r1.likelihood);

  const rated = r1.consequence !== null && r1.consequence !== undefined && r1.consequence !== "";
  if (rated && (consequence === null || consequence < 0 || consequence > 5)) {
    return flag({
      ruleKey: RULE_KEYS.R1_MATH_CONSISTENCY,
      entityType: "evaluation",
      entityId: evaluation.id,
      message: `R1 consequence "${r1.consequence}" is outside the 1-5 matrix.`
    });
  }

  const likelihoodGiven = r1.likelihood !== null && r1.likelihood !== undefined && r1.likelihood !== "";
  if (likelihoodGiven && (likelihood === null || likelihood < 1 || likelihood > 5)) {
    return flag({
      ruleKey: RULE_KEYS.R1_MATH_CONSISTENCY,
      entityType: "evaluation",
      entityId: evaluation.id,
      message: `R1 likelihood "${r1.likelihood}" is outside the 1-5 matrix.`
    });
  }

  const storedScore = axisValue(r1.score);
  if (storedScore === null || consequence === null || likelihood === null || consequence === 0) {
    return null;
  }

  const expected = consequence * likelihood;
  if (storedScore === expected) {
    return null;
  }
  return flag({
    ruleKey: RULE_KEYS.R1_MATH_CONSISTENCY,
    entityType: "evaluation",
    entityId: evaluation.id,
    message: `R1 score is ${storedScore} but consequence ${consequence} x likelihood ${likelihood} is ${expected}.`
  });
}

// The engine's free half. `assets` / `evaluations` are the mapped entities from
// the assessment bundle. Returns a flat, stable-ordered flag list (assets first,
// then evaluations in bundle order) — order is asserted by tests and keeps the
// client's chip rendering deterministic across checks.
function runDeterministicRules({ assets = [], evaluations = [] } = {}) {
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const flags = [];

  for (const asset of assets) {
    const hit = assetCriticalityVsConsequences(asset);
    if (hit) {
      flags.push(hit);
    }
  }

  for (const evaluation of evaluations) {
    const asset = assetsById.get(evaluation.assetId) || null;
    for (const hit of [severityVsCriticality({ evaluation, asset }), r1MathConsistency(evaluation)]) {
      if (hit) {
        flags.push(hit);
      }
    }
  }

  return flags;
}

module.exports = {
  RULE_KEYS,
  SEVERE_KEYWORDS,
  runDeterministicRules
};
