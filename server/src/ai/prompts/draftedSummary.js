// P4 · O5 — the AI-drafted Executive Summary (§1) / Conclusion (§8) prompt
// (businesslogic §9.1). Version-controlled here, one file per feature. The route
// gathers the assessment bundle (Sections 2–7 structured data), calls
// runAiCall({kind:'text'}) with the prompt below, returns the 3–5 paragraph
// draft, and retains the AI original in the audit row. No SDK import (plain JS)
// so the aiImportBoundary scan is unaffected.

const { getBand } = require("../../services/riskMatrixService");

const RISK_BANDS = ["Very High", "High", "Medium", "Low"];

// Stored r1/r2 hold { consequence, likelihood } — the score/band are DERIVED
// (not persisted; see the content-entity field-mapping decision). Compute them
// here from the SAME consequence × likelihood the rest of the app uses, tolerant
// of missing/out-of-range values (returns nulls rather than throwing like
// riskMatrixService.calculateRiskRating, since prompt data may be incomplete).
function deriveRating(riskBag) {
  const consequence = Number(riskBag && riskBag.consequence);
  const likelihood = Number(riskBag && riskBag.likelihood);
  if (
    !Number.isInteger(consequence) ||
    !Number.isInteger(likelihood) ||
    consequence < 1 ||
    consequence > 5 ||
    likelihood < 1 ||
    likelihood > 5
  ) {
    return { score: null, band: null };
  }
  const score = consequence * likelihood;
  return { score, band: getBand(score) };
}

// Pre-mitigation (R1) band tally across the evaluations, for the prompt context.
function riskDistribution(evaluations = []) {
  const counts = { "Very High": 0, High: 0, Medium: 0, Low: 0 };
  for (const evaluation of evaluations) {
    const { band } = deriveRating(evaluation.r1);
    if (band && Object.prototype.hasOwnProperty.call(counts, band)) {
      counts[band] += 1;
    }
  }
  return RISK_BANDS.map((band) => `${band}: ${counts[band]}`).join(", ");
}

// The highest-risk scenarios (by derived R1 score), a few lines the model can
// lean on.
function topScenarios(evaluations = [], assetsById, threatsById, limit = 5) {
  return [...evaluations]
    .filter((e) => e.scenario)
    .map((e) => ({ ...e, rating: deriveRating(e.r1) }))
    .sort((a, b) => (b.rating.score || 0) - (a.rating.score || 0))
    .slice(0, limit)
    .map((e) => {
      const asset = assetsById.get(e.assetId);
      const threat = threatsById.get(e.threatId);
      const band = e.rating.band ? ` [${e.rating.band}]` : "";
      return `- ${asset ? asset.name : "Asset"} × ${threat ? threat.name : "Threat"}${band}: ${e.scenario}`;
    })
    .join("\n");
}

// Section 2 (Facility Information) is stored as a JSON blob in content_text; pull
// a couple of human-readable lines if present, else fall back to the name.
function facilityLine(assessment, sectionTexts = {}) {
  const raw = sectionTexts[2];
  if (raw) {
    try {
      const info = JSON.parse(raw);
      const bits = [info.assetType, info.location, info.regulatoryAuthority].filter(Boolean);
      if (bits.length) {
        return `${assessment.facilityName || "the facility"} — ${bits.join("; ")}`;
      }
    } catch (_e) {
      // Not JSON (older free text) — fall through to the plain name.
    }
  }
  return assessment.facilityName || "the facility";
}

function buildContext({ assessment, assets = [], threats = [], evaluations = [], mitigations = [], sectionTexts = {} }) {
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const threatsById = new Map(threats.map((t) => [t.id, t]));
  return [
    `Facility: ${facilityLine(assessment, sectionTexts)}`,
    `Assessment: ${assessment.name}`,
    `Assets assessed: ${assets.length}. Threat categories: ${threats.length}. Risk evaluations: ${evaluations.length}. Proposed mitigations: ${mitigations.length}.`,
    `Pre-mitigation risk distribution — ${riskDistribution(evaluations)}.`,
    "",
    "Highest-rated scenarios:",
    topScenarios(evaluations, assetsById, threatsById) || "- (none recorded)"
  ].join("\n");
}

const SECTION_BRIEF = {
  1: {
    title: "Executive Summary",
    instruction:
      "Write a board-ready Executive Summary: methodology and scope, the residual risk distribution, " +
      "the most material exposures, and the thrust of the proposed mitigations. Keep it decision-useful for an approver."
  },
  8: {
    title: "Conclusion",
    instruction:
      "Write a Conclusion: restate the overall risk posture after mitigation, the key actions required, " +
      "any conditions for approval, and the recommended review cadence. Do not introduce new findings."
  }
};

function buildDraftPrompt({ sectionNumber, ...bundle }) {
  const brief = SECTION_BRIEF[sectionNumber] || SECTION_BRIEF[1];
  return [
    `You are drafting the ${brief.title} of a physical-security Security Risk Assessment (SRA).`,
    brief.instruction,
    "Write 3 to 5 concise paragraphs of plain prose (no headings, no bullet lists, no markdown).",
    "Base it ONLY on the structured data below — do not invent facilities, numbers, or scenarios.",
    "",
    "STRUCTURED DATA",
    "===============",
    buildContext(bundle)
  ].join("\n");
}

module.exports = { buildDraftPrompt, riskDistribution, SECTION_BRIEF };
