function linkKey({ assetId, threatId }) {
  return `${assetId}:${threatId}`;
}

function syncEvaluationsForLinks({ links, evaluations = [] }) {
  const activeLinkKeys = new Set(links.filter((link) => link.enabled).map(linkKey));
  const existingByLink = new Map(evaluations.map((evaluation) => [linkKey(evaluation), evaluation]));

  const kept = evaluations.filter((evaluation) => activeLinkKeys.has(linkKey(evaluation)));

  const created = [...activeLinkKeys]
    .filter((key) => !existingByLink.has(key))
    .map((key) => {
      const [assetId, threatId] = key.split(":");
      return {
        assetId,
        threatId,
        scenario: "",
        controls: "",
        vulnerabilities: "",
        proposedMitigation: "",
        r1: null,
        r2: null
      };
    });

  return {
    evaluations: [...kept, ...created],
    createdCount: created.length,
    removedCount: evaluations.length - kept.length
  };
}

function createMitigationFromEvaluation({ evaluation, ownerLabel = null, targetDate = null }) {
  if (!evaluation || !evaluation.id) {
    throw new Error("Evaluation is required to create a mitigation");
  }

  return {
    evaluationId: evaluation.id,
    assessmentId: evaluation.assessmentId,
    facilityId: evaluation.facilityId,
    description: evaluation.proposedMitigation || "",
    severity: evaluation.r1?.band || null,
    agreed: "Pending",
    ownerLabel,
    targetDate,
    status: "Open",
    progressLogs: []
  };
}

module.exports = {
  syncEvaluationsForLinks,
  createMitigationFromEvaluation
};
