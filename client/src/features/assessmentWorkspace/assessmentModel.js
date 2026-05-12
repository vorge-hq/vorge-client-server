import { ROLES } from "../../auth/session";

export const ASSESSMENT_STATES = Object.freeze({
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved"
});

export const SRA_SECTIONS = Object.freeze([
  { id: 1, label: "Executive Summary", icon: "doc", short: "Summary" },
  { id: 2, label: "Facility Information", icon: "building", short: "Facility" },
  { id: 3, label: "Asset Disaggregation", icon: "layers", short: "Assets" },
  { id: 4, label: "Threat Assessment", icon: "shield", short: "Threats" },
  { id: 5, label: "Asset Attractiveness Cross-Reference", icon: "grid", short: "Matrix" },
  { id: 6, label: "Vulnerability Assessment & Risk Treatment", icon: "alert", short: "Evaluations" },
  { id: 7, label: "Proposed Mitigation", icon: "check", short: "Mitigations" },
  { id: 8, label: "Conclusion", icon: "doc", short: "Conclusion" },
  { id: 9, label: "Appendices", icon: "list", short: "Appendices" }
]);

export const STATE_DESCRIPTORS = Object.freeze({
  [ASSESSMENT_STATES.DRAFT]: {
    short: "Draft",
    description: "Authors can edit unlocked assessment content.",
    chip: { fg: "text-text-secondary", bg: "bg-surface-muted" }
  },
  [ASSESSMENT_STATES.IN_REVIEW]: {
    short: "In Review",
    description: "Reviewers can comment and lock validated fields.",
    chip: { fg: "text-primary-700", bg: "bg-primary-50" }
  },
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: {
    short: "Awaiting Approval",
    description: "Approver decision is required; content is read-only.",
    chip: { fg: "text-secondary-800", bg: "bg-secondary-50" }
  },
  [ASSESSMENT_STATES.APPROVED]: {
    short: "Approved",
    description:
      "Assessment content is frozen. Mitigation progress is updated by Mitigation Owners only.",
    chip: { fg: "text-severity-low-text", bg: "bg-severity-low-bg" }
  }
});

export function getAssessmentStateBanner(state) {
  return STATE_DESCRIPTORS[state]?.description ?? "Assessment state is unavailable.";
}

export function getStateChipClasses(state) {
  const chip = STATE_DESCRIPTORS[state]?.chip;
  return chip ? `${chip.fg} ${chip.bg}` : "text-text-muted bg-surface-muted";
}

export function isAssessmentReadOnly({ state, actingRole, serverCanEditContent = false }) {
  if (serverCanEditContent) {
    return false;
  }

  if (actingRole !== ROLES.AUTHOR) {
    return true;
  }

  return state !== ASSESSMENT_STATES.DRAFT;
}

export function getSectionProgress(sections = SRA_SECTIONS, completedSectionIds = []) {
  const completed = completedSectionIds.length;
  const total = sections.length;

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

/* ============================================================
   Evaluation completeness (Section 6)
   Used by both the Section 5 matrix dots and the Section 6
   sidebar matrix to give a truthful readout of whether each
   asset-threat evaluation has been meaningfully filled.

   MODERATE bar: scenario + consequences + existingControls +
   vulnerabilities + proposedMitigation + R1 (consequence/likelihood).
   R2 (post-mitigation) is optional polish.
   ============================================================ */
export function isEvaluationComplete(evaluation) {
  if (!evaluation) return false;
  return Boolean(
    evaluation.scenario?.trim() &&
      evaluation.consequences?.trim() &&
      evaluation.existingControls?.trim() &&
      evaluation.vulnerabilities?.trim() &&
      evaluation.proposedMitigation?.trim() &&
      evaluation.consequenceR1 &&
      evaluation.likelihoodR1
  );
}

export function getEvaluationStatus(evaluation) {
  if (!evaluation) return "missing";
  if (isEvaluationComplete(evaluation)) return "complete";
  return "in-progress";
}

/* True when the evaluation has ANY meaningful field set. Used by
   toggleMatrix's smart cleanup: an empty stub gets removed when the
   user unticks (so misclicks don't accumulate orphans), but anything
   the user has touched is preserved orphaned and restored on re-tick. */
export function evaluationHasAnyData(evaluation) {
  if (!evaluation) return false;
  return Boolean(
    evaluation.scenario?.trim() ||
      evaluation.consequences?.trim() ||
      evaluation.existingControls?.trim() ||
      evaluation.vulnerabilities?.trim() ||
      evaluation.proposedMitigation?.trim() ||
      evaluation.consequenceR1 ||
      evaluation.likelihoodR1 ||
      evaluation.consequenceR2 ||
      evaluation.likelihoodR2
  );
}

/* Derives whether Section 6 should count as complete for the
   section-rail. Returns true when at least one cell is in scope
   AND every in-scope cell has a complete evaluation.
   Returns false when no cells are scoped (nothing to evaluate). */
export function isSection6Complete({ matrix = {}, evaluations = [] } = {}) {
  const scopedKeys = Object.keys(matrix).filter((key) => matrix[key]);
  if (scopedKeys.length === 0) return false;
  const evalByKey = new Map(
    evaluations.map((evaluation) => [`${evaluation.assetId}|${evaluation.threatId}`, evaluation])
  );
  return scopedKeys.every((key) => isEvaluationComplete(evalByKey.get(key)));
}

export function getWorkflowActionsForRole({
  state,
  actingRole,
  isLeadAuthor = true,
  reviewerState = null,
  approverState = null,
  pendingRecall = null
} = {}) {
  const actions = [];

  if (actingRole === ROLES.AUTHOR && isLeadAuthor && state === ASSESSMENT_STATES.DRAFT) {
    actions.push({ id: "submit", label: "Submit for review", tone: "primary" });
  }

  if (actingRole === ROLES.AUTHOR && state === ASSESSMENT_STATES.IN_REVIEW && !pendingRecall) {
    if (reviewerState === "opened") {
      actions.push({ id: "recall-request", label: "Request recall", tone: "secondary" });
    } else {
      actions.push({ id: "recall-immediate", label: "Recall", tone: "secondary" });
    }
  }

  if (actingRole === ROLES.REVIEWER && state === ASSESSMENT_STATES.IN_REVIEW) {
    actions.push({ id: "review-complete", label: "Mark review complete", tone: "primary" });
    actions.push({ id: "send-back-author", label: "Send back to Author", tone: "warn" });
  }

  if (
    actingRole === ROLES.REVIEWER &&
    state === ASSESSMENT_STATES.AWAITING_APPROVAL &&
    !pendingRecall
  ) {
    if (approverState === "opened") {
      actions.push({
        id: "recall-request-reviewer",
        label: "Request recall",
        tone: "secondary"
      });
    } else {
      actions.push({
        id: "reviewer-recall-immediate",
        label: "Recall",
        tone: "secondary"
      });
    }
  }

  if (actingRole === ROLES.APPROVER && state === ASSESSMENT_STATES.AWAITING_APPROVAL) {
    actions.push({ id: "approve", label: "Approve", tone: "primary" });
    actions.push({ id: "send-back-reviewer", label: "Send back to Reviewer", tone: "warn" });
    actions.push({ id: "reject", label: "Reject to Draft", tone: "danger" });
  }

  return actions;
}

export function getActionTone(tone) {
  switch (tone) {
    case "primary":
      return "btn-primary";
    case "warn":
      return "btn-warn";
    case "danger":
      return "btn-danger";
    case "secondary":
    default:
      return "btn-secondary";
  }
}

export const ADVANCE_BANNER_BY_ROLE = Object.freeze({
  [ROLES.REVIEWER]: {
    [ASSESSMENT_STATES.DRAFT]:
      "This assessment is still in Draft. You can navigate in advance — comments and review actions unlock when the Author submits."
  },
  [ROLES.APPROVER]: {
    [ASSESSMENT_STATES.DRAFT]:
      "Read-only preview. Approval actions unlock once the Reviewer marks the assessment complete.",
    [ASSESSMENT_STATES.IN_REVIEW]:
      "Read-only preview while the Reviewer is working. Approval actions unlock once review is marked complete."
  }
});

export function getAdvanceBanner({ state, actingRole }) {
  return ADVANCE_BANNER_BY_ROLE[actingRole]?.[state] ?? null;
}
