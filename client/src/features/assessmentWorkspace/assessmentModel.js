import { ROLES } from "../../auth/session";

export const ASSESSMENT_STATES = Object.freeze({
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved"
});

export const SRA_SECTIONS = Object.freeze([
  { id: 1, label: "Executive Summary", icon: "doc", short: "Summary" },
  { id: 2, label: "Facility / Asset Information", icon: "building", short: "Facility" },
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
    chip: { fg: "text-state-draft", bg: "bg-state-draft-bg" }
  },
  [ASSESSMENT_STATES.IN_REVIEW]: {
    short: "In Review",
    description: "Reviewers can comment and lock validated fields.",
    chip: { fg: "text-state-review", bg: "bg-state-review-bg" }
  },
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: {
    short: "Awaiting Approval",
    description: "Approver decision is required; content is read-only.",
    chip: { fg: "text-state-approval", bg: "bg-state-approval-bg" }
  },
  [ASSESSMENT_STATES.APPROVED]: {
    short: "Approved",
    description:
      "Assessment content is frozen. Mitigation progress is updated by Mitigation Owners only.",
    chip: { fg: "text-state-approved", bg: "bg-state-approved-bg" }
  }
});

export function getAssessmentStateBanner(state) {
  return STATE_DESCRIPTORS[state]?.description ?? "Assessment state is unavailable.";
}

export function getStateChipClasses(state) {
  const chip = STATE_DESCRIPTORS[state]?.chip;
  return chip ? `${chip.fg} ${chip.bg}` : "text-zinc-600 bg-zinc-100";
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
