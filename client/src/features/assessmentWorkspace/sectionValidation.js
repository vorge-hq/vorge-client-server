const EMPTY_ERRORS = Object.freeze({
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
  7: [],
  8: [],
  9: []
});

function emptyBuckets() {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
}

function isBlank(value) {
  return !value || !String(value).trim();
}

/* Build a human-readable label for an evaluation, anchored on the
   asset x threat scenario. Falls back through asset/threat name,
   short, or classification. The internal evaluation id is intentionally
   never used in user-visible strings. */
function evaluationLabel(evaluation, assets, threats) {
  const asset = assets.find((a) => a.id === evaluation.assetId);
  const threat = threats.find((t) => t.id === evaluation.threatId);
  const assetLabel = asset?.name || evaluation.assetId;
  const threatLabel =
    threat?.short || threat?.classification || threat?.name || evaluation.threatId;
  if (assetLabel && threatLabel) {
    return `the ${assetLabel} × ${threatLabel} evaluation`;
  }
  return "an evaluation";
}

/* Build a human-readable label for a mitigation, anchored on the
   asset x threat scenario it addresses. Falls back to the proposed
   mitigation text or — in the worst case — to a generic phrase. The
   internal id is intentionally never used in user-visible strings. */
function mitigationLabel(mitigation, evaluations, assets, threats) {
  if (mitigation.assetThreat) {
    return `the ${mitigation.assetThreat} mitigation`;
  }
  const evaluation = evaluations.find((e) => e.id === mitigation.evaluationId);
  if (evaluation) {
    const asset = assets.find((a) => a.id === evaluation.assetId);
    const threat = threats.find((t) => t.id === evaluation.threatId);
    const assetLabel = asset?.name || evaluation.assetId;
    const threatLabel = threat?.short || threat?.classification || threat?.name || evaluation.threatId;
    if (assetLabel && threatLabel) {
      return `the ${assetLabel} \u00d7 ${threatLabel} mitigation`;
    }
  }
  if (mitigation.description) {
    const trimmed = String(mitigation.description).trim();
    if (trimmed.length > 0) {
      const summary = trimmed.length > 60 ? `${trimmed.slice(0, 57)}\u2026` : trimmed;
      return `the mitigation "${summary}"`;
    }
  }
  return "a mitigation";
}

export function validateAssessment(input = {}) {
  const {
    assessment = null,
    assets = [],
    threats = [],
    evaluations = [],
    mitigations = []
  } = input;

  if (!assessment) {
    return { ...EMPTY_ERRORS };
  }

  const out = emptyBuckets();

  if (isBlank(assessment.executiveSummary)) {
    out[1].push({ code: "exec-empty", message: "Executive summary is empty." });
  }

  if (isBlank(assessment.facilityName) && isBlank(assessment.facilityId)) {
    out[2].push({ code: "facility-empty", message: "Facility identifier is missing." });
  }

  if (assets.length === 0) {
    out[3].push({ code: "no-assets", message: "Add at least one asset." });
  }
  assets.forEach((asset) => {
    if (isBlank(asset.description)) {
      out[3].push({
        code: "asset-desc",
        message: `Asset "${asset.name || asset.id}" has no description.`
      });
    }
    if (isBlank(asset.criticality)) {
      out[3].push({
        code: "asset-criticality",
        message: `Asset "${asset.name || asset.id}" has no criticality.`
      });
    }
  });

  threats.forEach((threat) => {
    if (isBlank(threat.rating)) {
      out[4].push({
        code: "threat-rating",
        message: `Threat "${threat.classification || threat.id}" has no rating.`
      });
    }
  });

  evaluations.forEach((evaluation) => {
    const label = evaluationLabel(evaluation, assets, threats);
    const sentenceLabel = label.charAt(0).toUpperCase() + label.slice(1);
    if (isBlank(evaluation.scenario)) {
      out[6].push({
        code: "eval-scenario",
        message: `${sentenceLabel} is missing the risk scenario.`
      });
    }
    if (!evaluation.consequenceR1 || !evaluation.likelihoodR1) {
      out[6].push({
        code: "eval-r1",
        message: `${sentenceLabel} has no R1 score.`
      });
    }
  });

  mitigations.forEach((mitigation) => {
    const owner = mitigation.ownerLabel || mitigation.owner;
    const target = mitigation.targetDate || mitigation.target;
    const label = mitigationLabel(mitigation, evaluations, assets, threats);
    const sentenceLabel = label.charAt(0).toUpperCase() + label.slice(1);
    if (isBlank(owner)) {
      out[7].push({
        code: "mit-owner",
        message: `${sentenceLabel} has no owner.`
      });
    }
    if (isBlank(target)) {
      out[7].push({
        code: "mit-target",
        message: `${sentenceLabel} has no target date.`
      });
    }
    if (mitigation.agreed === "Pending") {
      out[7].push({
        code: "mit-agreed",
        message: `${sentenceLabel} is still pending agreement.`
      });
    }
  });

  if (isBlank(assessment.conclusion)) {
    out[8].push({ code: "conclusion-empty", message: "Conclusion is empty." });
  }

  return out;
}

export function commentCountsBySection(audit = []) {
  const counts = {};
  audit.forEach((entry) => {
    if (entry.action === "comment" && entry.sectionId) {
      counts[entry.sectionId] = (counts[entry.sectionId] || 0) + 1;
    }
  });
  return counts;
}
