import { ROLES } from "../../auth/session";
import { ASSESSMENT_STATES } from "./assessmentModel";

export const WORKFLOW_ACTIONS = Object.freeze({
  SUBMIT: "submit",
  WITHDRAW: "withdraw",
  RECALL_REQUEST: "recall-request",
  RECALL_APPROVE: "recall-approve",
  RECALL_DECLINE: "recall-decline",
  REVIEWER_OPENED: "reviewer-opened",
  APPROVER_OPENED: "approver-opened",
  REVIEW_COMPLETE: "review-complete",
  REVIEWER_SEND_BACK: "reviewer-send-back",
  APPROVE: "approve",
  APPROVER_SEND_BACK: "approver-send-back",
  REJECT: "reject"
});

const TODAY = () => new Date().toISOString().slice(0, 10);
const NOW = () => new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

function audit({ user, role, action, assessment, detail, ip = "127.0.0.1" }) {
  return {
    id: `au-new-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: NOW(),
    user,
    role,
    action,
    facility: assessment.facilityName || "—",
    assessment: assessment.name || "—",
    detail: typeof detail === "string" ? detail : JSON.stringify(detail || {}),
    section: "Workflow",
    ip
  };
}

export function getInitialAssessmentState(assessment) {
  return {
    state: assessment.state,
    version: assessment.version || "v0.1",
    signatureDates: {
      author: assessment.submittedAt ? assessment.submittedAt.slice(0, 10) : null,
      reviewer:
        assessment.state === ASSESSMENT_STATES.AWAITING_APPROVAL ||
        assessment.state === ASSESSMENT_STATES.APPROVED
          ? "2026-04-26"
          : null,
      approver: assessment.approvedAt ? assessment.approvedAt.slice(0, 10) : null,
      approverNote: null
    },
    sentBack: assessment.sendBackBanner || null,
    reviewerState:
      assessment.reviewerState !== undefined
        ? assessment.reviewerState
        : assessment.state === ASSESSMENT_STATES.IN_REVIEW
          ? "not-opened"
          : null,
    approverState:
      assessment.approverState !== undefined
        ? assessment.approverState
        : assessment.state === ASSESSMENT_STATES.AWAITING_APPROVAL
          ? "not-opened"
          : null,
    pendingRecall: null
  };
}

function recallReceiverFor(requesterRole, fromState) {
  if (requesterRole === ROLES.AUTHOR && fromState === ASSESSMENT_STATES.IN_REVIEW) {
    return ROLES.REVIEWER;
  }
  if (requesterRole === ROLES.REVIEWER && fromState === ASSESSMENT_STATES.AWAITING_APPROVAL) {
    return ROLES.APPROVER;
  }
  return null;
}

export function applyWorkflowAction(prev, action) {
  const { type, actor, assessment, reason = "", note = "" } = action;
  const next = {
    ...prev,
    signatureDates: { ...prev.signatureDates }
  };
  let auditEntry = null;

  switch (type) {
    case WORKFLOW_ACTIONS.SUBMIT: {
      if (actor.role !== ROLES.AUTHOR) {
        return { error: "Only the Author can submit for review." };
      }
      if (prev.state !== ASSESSMENT_STATES.DRAFT) {
        return { error: "Only Draft assessments can be submitted." };
      }
      next.state = ASSESSMENT_STATES.IN_REVIEW;
      next.signatureDates.author = TODAY();
      next.reviewerState = "not-opened";
      next.approverState = null;
      next.pendingRecall = null;
      next.sentBack = null;
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "submit",
        assessment,
        detail: { to: "Reviewer" }
      });
      break;
    }
    case WORKFLOW_ACTIONS.WITHDRAW: {
      if (actor.role === ROLES.AUTHOR) {
        if (prev.state !== ASSESSMENT_STATES.IN_REVIEW) {
          return { error: "Withdraw is only available while In Review." };
        }
        if (prev.reviewerState && prev.reviewerState !== "not-opened") {
          return { error: "Reviewer has already opened — request a recall instead." };
        }
        next.state = ASSESSMENT_STATES.DRAFT;
        next.reviewerState = null;
        next.signatureDates.author = null;
      } else if (actor.role === ROLES.REVIEWER) {
        if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
          return { error: "Reviewer withdraw is only available while Awaiting Approval." };
        }
        if (prev.approverState && prev.approverState !== "not-opened") {
          return { error: "Approver has already opened — request a recall instead." };
        }
        next.state = ASSESSMENT_STATES.IN_REVIEW;
        next.reviewerState = "opened";
        next.approverState = null;
        next.signatureDates.reviewer = null;
      } else {
        return { error: "Only the Author or Reviewer can withdraw a submission." };
      }
      next.pendingRecall = null;
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "withdraw",
        assessment,
        detail: { reason: reason || "(no reason provided)" }
      });
      break;
    }
    case WORKFLOW_ACTIONS.RECALL_REQUEST: {
      if (prev.pendingRecall) {
        return { error: "A recall request is already pending on this assessment." };
      }
      if (prev.state === ASSESSMENT_STATES.APPROVED) {
        return { error: "Approved assessments cannot be recalled." };
      }
      if (prev.state === ASSESSMENT_STATES.DRAFT) {
        return { error: "Recall requires the assessment to be in review or awaiting approval." };
      }
      if (actor.role === ROLES.AUTHOR) {
        if (prev.state !== ASSESSMENT_STATES.IN_REVIEW) {
          return { error: "Once reviewed, the Author cannot recall — the Reviewer must request it." };
        }
        if (prev.reviewerState !== "opened") {
          return { error: "Reviewer has not opened yet — withdraw the submission instead." };
        }
      } else if (actor.role === ROLES.REVIEWER) {
        if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
          return { error: "Reviewer recall is only available while Awaiting Approval." };
        }
        if (prev.approverState !== "opened") {
          return { error: "Approver has not opened yet — withdraw the submission instead." };
        }
      } else {
        return { error: "Only the Author or Reviewer can request a recall." };
      }
      const fromState = prev.state;
      const receiver = recallReceiverFor(actor.role, fromState);
      next.pendingRecall = {
        requesterRole: actor.role,
        requesterName: actor.name,
        receiverRole: receiver,
        reason: reason || "(no reason provided)",
        fromState,
        createdAt: TODAY()
      };
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "recall-request",
        assessment,
        detail: { from: fromState, reason: reason || "(no reason provided)", receiver }
      });
      break;
    }
    case WORKFLOW_ACTIONS.RECALL_APPROVE: {
      if (!prev.pendingRecall) {
        return { error: "No pending recall request." };
      }
      if (actor.role !== prev.pendingRecall.receiverRole) {
        return { error: `Only the ${prev.pendingRecall.receiverRole} can approve this recall.` };
      }
      const fromState = prev.pendingRecall.fromState;
      if (fromState === ASSESSMENT_STATES.IN_REVIEW) {
        next.state = ASSESSMENT_STATES.DRAFT;
        next.reviewerState = null;
        next.signatureDates.author = null;
      } else if (fromState === ASSESSMENT_STATES.AWAITING_APPROVAL) {
        next.state = ASSESSMENT_STATES.IN_REVIEW;
        next.reviewerState = "opened";
        next.approverState = null;
        next.signatureDates.reviewer = null;
      }
      next.pendingRecall = null;
      next.sentBack = null;
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "recall-approved",
        assessment,
        detail: {
          requester: prev.pendingRecall.requesterName,
          requesterRole: prev.pendingRecall.requesterRole,
          fromState
        }
      });
      break;
    }
    case WORKFLOW_ACTIONS.RECALL_DECLINE: {
      if (!prev.pendingRecall) {
        return { error: "No pending recall request." };
      }
      if (actor.role !== prev.pendingRecall.receiverRole) {
        return { error: `Only the ${prev.pendingRecall.receiverRole} can decline this recall.` };
      }
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "recall-declined",
        assessment,
        detail: {
          requester: prev.pendingRecall.requesterName,
          requesterRole: prev.pendingRecall.requesterRole,
          reason: reason || "(no reason provided)"
        }
      });
      next.pendingRecall = null;
      break;
    }
    case WORKFLOW_ACTIONS.REVIEWER_OPENED: {
      if (actor.role !== ROLES.REVIEWER) {
        return { next: prev, auditEntry: null };
      }
      if (prev.reviewerState === "opened") {
        return { next: prev, auditEntry: null };
      }
      next.reviewerState = "opened";
      break;
    }
    case WORKFLOW_ACTIONS.APPROVER_OPENED: {
      if (actor.role !== ROLES.APPROVER) {
        return { next: prev, auditEntry: null };
      }
      if (prev.approverState === "opened") {
        return { next: prev, auditEntry: null };
      }
      next.approverState = "opened";
      break;
    }
    case WORKFLOW_ACTIONS.REVIEW_COMPLETE: {
      if (actor.role !== ROLES.REVIEWER) {
        return { error: "Only the Reviewer can mark review complete." };
      }
      if (prev.state !== ASSESSMENT_STATES.IN_REVIEW) {
        return { error: "Review-complete only applies during In Review." };
      }
      next.state = ASSESSMENT_STATES.AWAITING_APPROVAL;
      next.signatureDates.reviewer = TODAY();
      next.approverState = "not-opened";
      next.pendingRecall = null;
      next.sentBack = null;
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "review-complete",
        assessment,
        detail: note ? { note } : null
      });
      break;
    }
    case WORKFLOW_ACTIONS.REVIEWER_SEND_BACK: {
      if (actor.role !== ROLES.REVIEWER) {
        return { error: "Only the Reviewer can send back to Author." };
      }
      if (prev.state !== ASSESSMENT_STATES.IN_REVIEW) {
        return { error: "Send-back only applies during In Review." };
      }
      if (!reason) {
        return { error: "A reason is required to send back to the Author." };
      }
      next.state = ASSESSMENT_STATES.DRAFT;
      next.reviewerState = "not-opened";
      next.approverState = null;
      next.pendingRecall = null;
      next.signatureDates.author = null;
      next.signatureDates.reviewer = null;
      next.sentBack = {
        kind: "reviewer-to-author",
        from: actor.name,
        date: TODAY(),
        reason
      };
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "send-back-to-author",
        assessment,
        detail: { reason }
      });
      break;
    }
    case WORKFLOW_ACTIONS.APPROVE: {
      if (actor.role !== ROLES.APPROVER) {
        return { error: "Only the Approver can approve." };
      }
      if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
        return { error: "Approve only applies when Awaiting Approval." };
      }
      next.state = ASSESSMENT_STATES.APPROVED;
      next.signatureDates.approver = TODAY();
      next.signatureDates.approverNote = note || null;
      next.approverState = null;
      next.pendingRecall = null;
      next.sentBack = null;
      next.version = "v1.0";
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "approve",
        assessment,
        detail: note ? { note, version: "v1.0", e_signed: true } : { version: "v1.0", e_signed: true }
      });
      break;
    }
    case WORKFLOW_ACTIONS.APPROVER_SEND_BACK: {
      if (actor.role !== ROLES.APPROVER) {
        return { error: "Only the Approver can send back to Reviewer." };
      }
      if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
        return { error: "Send-back only applies when Awaiting Approval." };
      }
      if (!reason) {
        return { error: "A reason is required to send back to the Reviewer." };
      }
      next.state = ASSESSMENT_STATES.IN_REVIEW;
      next.signatureDates.reviewer = null;
      next.approverState = null;
      next.reviewerState = "opened";
      next.pendingRecall = null;
      next.sentBack = {
        kind: "approver-to-reviewer",
        from: actor.name,
        date: TODAY(),
        reason
      };
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "send-back-to-reviewer",
        assessment,
        detail: { reason }
      });
      break;
    }
    case WORKFLOW_ACTIONS.REJECT: {
      if (actor.role !== ROLES.APPROVER) {
        return { error: "Only the Approver can reject." };
      }
      if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
        return { error: "Reject only applies when Awaiting Approval." };
      }
      if (!reason) {
        return { error: "A reason is required to reject." };
      }
      next.state = ASSESSMENT_STATES.DRAFT;
      next.reviewerState = "not-opened";
      next.approverState = null;
      next.pendingRecall = null;
      next.signatureDates = {
        author: null,
        reviewer: null,
        approver: null,
        approverNote: null
      };
      next.sentBack = {
        kind: "approver-reject",
        from: actor.name,
        date: TODAY(),
        reason
      };
      auditEntry = audit({
        user: actor.name,
        role: actor.role,
        action: "reject",
        assessment,
        detail: { reason }
      });
      break;
    }
    default:
      return { error: `Unknown workflow action: ${type}` };
  }

  return { next, auditEntry };
}

export function applyDemoRoleSideEffects(prev, role) {
  const next = { ...prev, signatureDates: { ...prev.signatureDates } };

  if (role === ROLES.REVIEWER) {
    if (prev.state === ASSESSMENT_STATES.DRAFT || prev.state === ASSESSMENT_STATES.APPROVED) {
      next.state = ASSESSMENT_STATES.IN_REVIEW;
      next.reviewerState = "opened";
      next.approverState = null;
      next.pendingRecall = null;
      if (!prev.signatureDates.author) {
        next.signatureDates.author = "2026-04-25";
      }
    }
  } else if (role === ROLES.APPROVER) {
    if (prev.state !== ASSESSMENT_STATES.AWAITING_APPROVAL) {
      next.state = ASSESSMENT_STATES.AWAITING_APPROVAL;
      next.approverState = "not-opened";
      next.pendingRecall = null;
      next.signatureDates.author = prev.signatureDates.author || "2026-04-25";
      next.signatureDates.reviewer = prev.signatureDates.reviewer || "2026-04-26";
    }
  } else if (role === ROLES.MITIGATION_OWNER) {
    if (prev.state !== ASSESSMENT_STATES.APPROVED) {
      next.state = ASSESSMENT_STATES.APPROVED;
      next.approverState = null;
      next.pendingRecall = null;
      next.signatureDates.author = prev.signatureDates.author || "2026-04-25";
      next.signatureDates.reviewer = prev.signatureDates.reviewer || "2026-04-26";
      next.signatureDates.approver = prev.signatureDates.approver || "2026-04-27";
    }
  }

  return next;
}
