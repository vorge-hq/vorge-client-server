const { ASSESSMENT_STATES, ROLES } = require("./constants");
const { DomainError } = require("./domainError");

const ACTIONS = Object.freeze({
  SUBMIT_FOR_REVIEW: "submit_for_review",
  WITHDRAW_TO_DRAFT: "withdraw_to_draft",
  SEND_BACK_TO_AUTHOR: "send_back_to_author",
  COMPLETE_REVIEW: "complete_review",
  RECALL_REVIEW_COMPLETION: "recall_review_completion",
  APPROVE: "approve",
  SEND_BACK_TO_REVIEWER: "send_back_to_reviewer",
  REJECT_TO_DRAFT: "reject_to_draft"
});

const TRANSITIONS = Object.freeze({
  [ACTIONS.SUBMIT_FOR_REVIEW]: {
    from: ASSESSMENT_STATES.DRAFT,
    to: ASSESSMENT_STATES.IN_REVIEW,
    role: ROLES.AUTHOR,
    auditAction: "assessment.submitted_for_review",
    requireReason: false,
    signatures: { author: "stamp", reviewer: "clear", approver: "clear" }
  },
  [ACTIONS.WITHDRAW_TO_DRAFT]: {
    from: ASSESSMENT_STATES.IN_REVIEW,
    to: ASSESSMENT_STATES.DRAFT,
    role: ROLES.AUTHOR,
    auditAction: "assessment.withdrawn_to_draft",
    requireReason: true,
    signatures: { author: "clear", reviewer: "clear", approver: "clear" }
  },
  [ACTIONS.SEND_BACK_TO_AUTHOR]: {
    from: ASSESSMENT_STATES.IN_REVIEW,
    to: ASSESSMENT_STATES.DRAFT,
    role: ROLES.REVIEWER,
    auditAction: "assessment.sent_back_to_author",
    requireReason: true,
    signatures: { author: "clear", reviewer: "clear", approver: "clear" }
  },
  [ACTIONS.COMPLETE_REVIEW]: {
    from: ASSESSMENT_STATES.IN_REVIEW,
    to: ASSESSMENT_STATES.AWAITING_APPROVAL,
    role: ROLES.REVIEWER,
    auditAction: "assessment.review_completed",
    requireReason: false,
    signatures: { reviewer: "stamp", approver: "clear" }
  },
  [ACTIONS.RECALL_REVIEW_COMPLETION]: {
    from: ASSESSMENT_STATES.AWAITING_APPROVAL,
    to: ASSESSMENT_STATES.IN_REVIEW,
    role: ROLES.REVIEWER,
    auditAction: "assessment.review_completion_recalled",
    requireReason: true,
    signatures: { reviewer: "clear", approver: "clear" }
  },
  [ACTIONS.APPROVE]: {
    from: ASSESSMENT_STATES.AWAITING_APPROVAL,
    to: ASSESSMENT_STATES.APPROVED,
    role: ROLES.APPROVER,
    auditAction: "assessment.approved",
    requireReason: false,
    signatures: { approver: "stamp" }
  },
  [ACTIONS.SEND_BACK_TO_REVIEWER]: {
    from: ASSESSMENT_STATES.AWAITING_APPROVAL,
    to: ASSESSMENT_STATES.IN_REVIEW,
    role: ROLES.APPROVER,
    auditAction: "assessment.sent_back_to_reviewer",
    requireReason: true,
    signatures: { reviewer: "clear", approver: "clear" }
  },
  [ACTIONS.REJECT_TO_DRAFT]: {
    from: ASSESSMENT_STATES.AWAITING_APPROVAL,
    to: ASSESSMENT_STATES.DRAFT,
    role: ROLES.APPROVER,
    auditAction: "assessment.rejected_to_draft",
    requireReason: true,
    signatures: { author: "clear", reviewer: "clear", approver: "clear" }
  }
});

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function transitionAssessment({ state, actingRole, action, reason, now = new Date() }) {
  const transition = TRANSITIONS[action];

  if (!transition) {
    throw new DomainError(`Unknown assessment workflow action: ${action}`, 400, "UNKNOWN_TRANSITION");
  }

  if (transition.from !== state) {
    throw new DomainError(
      `Cannot ${action} while assessment is ${state}`,
      409,
      "INVALID_ASSESSMENT_STATE",
      { expectedState: transition.from, actualState: state }
    );
  }

  if (transition.role !== actingRole) {
    throw new DomainError(
      `${actingRole} cannot perform ${action}`,
      403,
      "ROLE_NOT_ALLOWED",
      { requiredRole: transition.role, actualRole: actingRole }
    );
  }

  if (transition.requireReason && !hasText(reason)) {
    throw new DomainError("A reason is required for this workflow action", 400, "REASON_REQUIRED");
  }

  return {
    from: state,
    to: transition.to,
    action,
    auditAction: transition.auditAction,
    signatureEffects: transition.signatures,
    reason: hasText(reason) ? reason.trim() : null,
    transitionedAt: now.toISOString()
  };
}

function listAllowedWorkflowActions({ state, actingRole }) {
  return Object.entries(TRANSITIONS)
    .filter(([, transition]) => transition.from === state && transition.role === actingRole)
    .map(([action]) => action);
}

module.exports = {
  ACTIONS,
  TRANSITIONS,
  transitionAssessment,
  listAllowedWorkflowActions
};
