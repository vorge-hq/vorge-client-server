import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import {
  DEMO_PERSONAS,
  ROLES,
  canAccessFacility,
  canDemoSwitchToRole,
  canSwitchToRole,
  demoSession,
  getDemoPersona,
  isAuthenticated,
  isRoleMfaRequired
} from "../auth/session";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import {
  getHomeRouteForRole,
  getMobileNavigationForRole,
  getNavigationForRole
} from "./navigation/navigation";
import {
  ASSESSMENT_STATES,
  STATE_DESCRIPTORS,
  getActionTone,
  getAdvanceBanner,
  getAssessmentStateBanner,
  getSectionProgress,
  getStateChipClasses,
  getWorkflowActionsForRole,
  isAssessmentReadOnly
} from "./assessmentWorkspace/assessmentModel";
import {
  calculateRisk,
  getBandClasses,
  getBandForScore
} from "./assessmentWorkspace/riskMatrix";
import {
  MITIGATION_STATUSES,
  getMitigationKpis,
  validateMitigationUpdate
} from "./mitigationOwner/mitigationRules";
import { getOfflineModeMessage, isOnlineOnlyFeature } from "./fieldMode/offlineModel";
import {
  countUnread,
  filterForRole,
  getNotificationToneClasses
} from "./notifications/notificationModel";
import {
  WORKFLOW_ACTIONS,
  applyDemoRoleSideEffects,
  applyWorkflowAction,
  getInitialAssessmentState
} from "./assessmentWorkspace/workflowReducer";
import {
  filterAuditEntriesForRole,
  isAdminViewer,
  visibleIp
} from "./audit/auditVisibility";
import {
  commentCountsBySection,
  validateAssessment
} from "./assessmentWorkspace/sectionValidation";

describe("session helpers", () => {
  test("detects authentication", () => {
    expect(isAuthenticated(demoSession)).toBe(true);
    expect(isAuthenticated(null)).toBe(false);
    expect(isAuthenticated({})).toBe(false);
  });

  test("evaluates role and facility access", () => {
    expect(canSwitchToRole(demoSession, ROLES.REVIEWER)).toBe(true);
    expect(canSwitchToRole(demoSession, ROLES.ADMIN)).toBe(false);
    expect(canSwitchToRole(null, ROLES.ADMIN)).toBe(false);
    expect(canAccessFacility(demoSession, demoSession.facility.id)).toBe(true);
    expect(canAccessFacility(demoSession, "fake")).toBe(false);
  });

  test("MFA-required roles", () => {
    expect(isRoleMfaRequired(ROLES.APPROVER)).toBe(true);
    expect(isRoleMfaRequired(ROLES.ADMIN)).toBe(true);
    expect(isRoleMfaRequired(ROLES.AUTHOR)).toBe(false);
  });

  test("demo personas cover every role and demo switch is unrestricted", () => {
    Object.values(ROLES).forEach((role) => {
      expect(DEMO_PERSONAS[role]).toBeDefined();
      const persona = getDemoPersona(role);
      expect(persona.userId).toBeTruthy();
      expect(persona.email).toContain("@");
    });
    expect(getDemoPersona("Unknown")).toBeNull();
    expect(canDemoSwitchToRole(demoSession, ROLES.ADMIN)).toBe(true);
    expect(canDemoSwitchToRole(null, ROLES.ADMIN)).toBe(false);
    expect(canDemoSwitchToRole({ ...demoSession, demo: false }, ROLES.ADMIN)).toBe(false);
    expect(canDemoSwitchToRole({ ...demoSession, demo: false }, ROLES.AUTHOR)).toBe(true);
    expect(canDemoSwitchToRole(demoSession, "Unknown")).toBe(false);
  });
});

describe("navigation model", () => {
  test("returns role-specific navigation and mobile subset", () => {
    const author = getNavigationForRole(ROLES.AUTHOR);
    expect(author.length).toBeGreaterThan(0);
    expect(getMobileNavigationForRole(ROLES.AUTHOR).length).toBeGreaterThanOrEqual(1);
    expect(getNavigationForRole(ROLES.MITIGATION_OWNER)[0].to).toBe("/mitigations");
    expect(getNavigationForRole("Unknown")).toEqual([]);
    expect(getMobileNavigationForRole("Unknown")).toEqual([]);
    expect(getHomeRouteForRole(ROLES.MITIGATION_OWNER)).toBe("/mitigations");
    expect(getHomeRouteForRole(ROLES.ADMIN)).toBe("/admin");
    expect(getHomeRouteForRole(ROLES.AUTHOR)).toBe("/dashboard");
  });
});

describe("assessment workspace model", () => {
  test("state banners and chip classes", () => {
    Object.values(ASSESSMENT_STATES).forEach((state) => {
      expect(getAssessmentStateBanner(state).length).toBeGreaterThan(0);
      expect(STATE_DESCRIPTORS[state]).toBeDefined();
      expect(getStateChipClasses(state)).toContain("bg-");
    });
    expect(getAssessmentStateBanner("Unknown")).toContain("unavailable");
    expect(getStateChipClasses("Unknown")).toContain("text-zinc-600");
  });

  test("read-only logic respects role and state", () => {
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR })
    ).toBe(false);
    expect(
      isAssessmentReadOnly({
        state: ASSESSMENT_STATES.DRAFT,
        actingRole: ROLES.AUTHOR,
        serverCanEditContent: true
      })
    ).toBe(false);
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.AUTHOR })
    ).toBe(true);
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.REVIEWER })
    ).toBe(true);
  });

  test("section progress percent", () => {
    expect(getSectionProgress([{ id: 1 }, { id: 2 }, { id: 3 }], [1, 2])).toEqual({
      completed: 2,
      total: 3,
      percent: 67
    });
    expect(getSectionProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  test("workflow actions per role/state", () => {
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR }).map(
        (a) => a.id
      )
    ).toContain("submit");
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.REVIEWER }).map(
        (a) => a.id
      )
    ).toEqual(["review-complete", "send-back-author"]);
    expect(
      getWorkflowActionsForRole({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.APPROVER
      }).map((a) => a.id)
    ).toEqual(["approve", "send-back-reviewer", "reject"]);
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.APPROVED, actingRole: ROLES.AUTHOR })
    ).toEqual([]);
    expect(getActionTone("primary")).toBe("btn-primary");
    expect(getActionTone("warn")).toBe("btn-warn");
    expect(getActionTone("danger")).toBe("btn-danger");
    expect(getActionTone("secondary")).toBe("btn-secondary");
    expect(getActionTone("unknown")).toBe("btn-secondary");
  });

  test("recall actions appear contextually for Author and Reviewer", () => {
    const authorWithdraw = getWorkflowActionsForRole({
      state: ASSESSMENT_STATES.IN_REVIEW,
      actingRole: ROLES.AUTHOR,
      reviewerState: "not-opened"
    }).map((a) => a.id);
    expect(authorWithdraw).toContain("withdraw");

    const authorRecall = getWorkflowActionsForRole({
      state: ASSESSMENT_STATES.IN_REVIEW,
      actingRole: ROLES.AUTHOR,
      reviewerState: "opened"
    }).map((a) => a.id);
    expect(authorRecall).toContain("recall-request");
    expect(authorRecall).not.toContain("withdraw");

    const reviewerWithdraw = getWorkflowActionsForRole({
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      actingRole: ROLES.REVIEWER,
      approverState: "not-opened"
    }).map((a) => a.id);
    expect(reviewerWithdraw).toContain("withdraw-reviewer");

    const reviewerRecall = getWorkflowActionsForRole({
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      actingRole: ROLES.REVIEWER,
      approverState: "opened"
    }).map((a) => a.id);
    expect(reviewerRecall).toContain("recall-request-reviewer");

    const blockedWhenPending = getWorkflowActionsForRole({
      state: ASSESSMENT_STATES.IN_REVIEW,
      actingRole: ROLES.AUTHOR,
      reviewerState: "opened",
      pendingRecall: { requesterRole: ROLES.AUTHOR }
    }).map((a) => a.id);
    expect(blockedWhenPending).toEqual([]);
  });

  test("advance banner only for relevant roles", () => {
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.REVIEWER })
    ).toContain("Author submits");
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.APPROVER })
    ).toContain("review is marked complete");
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR })
    ).toBeNull();
  });
});

describe("risk matrix calculations", () => {
  test("score and band derivations", () => {
    expect(calculateRisk(0, 3).score).toBeNull();
    expect(calculateRisk(null, 3).score).toBeNull();
    expect(calculateRisk(2, 1)).toMatchObject({ score: 2, band: "Low" });
    expect(calculateRisk(3, 3)).toMatchObject({ score: 9, band: "Medium" });
    expect(calculateRisk(4, 3)).toMatchObject({ score: 12, band: "High" });
    expect(calculateRisk(5, 5)).toMatchObject({ score: 25, band: "Very High" });
    expect(getBandForScore(null)).toBeNull();
    expect(getBandForScore(0)?.id).toBe("Low");
    expect(getBandClasses("High")).toContain("bg-risk-high-bg");
    expect(getBandClasses("Unknown")).toContain("bg-zinc-100");
  });
});

describe("mitigation owner rules", () => {
  test("validation enforces approval, terminal Done, and required note", () => {
    expect(
      validateMitigationUpdate({
        currentStatus: "In Progress",
        nextStatus: "Done",
        note: "",
        assessmentState: "Approved"
      }).valid
    ).toBe(false);

    expect(
      validateMitigationUpdate({
        currentStatus: "In Progress",
        nextStatus: "Done",
        note: "Installed",
        assessmentState: "Approved"
      })
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateMitigationUpdate({
        currentStatus: "Done",
        nextStatus: "Open",
        note: "Reopen",
        assessmentState: "Approved"
      }).errors
    ).toContain("Done is terminal and cannot be reopened.");

    expect(
      validateMitigationUpdate({
        currentStatus: "Open",
        nextStatus: "In Progress",
        note: "",
        assessmentState: "Draft"
      }).errors
    ).toContain("Mitigation progress can only be updated after approval.");
  });

  test("KPIs calculate counts", () => {
    expect(
      getMitigationKpis([
        { status: MITIGATION_STATUSES.OPEN, targetDate: "2000-01-01" },
        { status: MITIGATION_STATUSES.IN_PROGRESS, targetDate: "2999-01-01" },
        { status: MITIGATION_STATUSES.DONE, updatedAt: new Date().toISOString() }
      ])
    ).toEqual({ open: 1, inProgress: 1, overdue: 1, doneThisYear: 1 });

    expect(getMitigationKpis([])).toEqual({ open: 0, inProgress: 0, overdue: 0, doneThisYear: 0 });
  });
});

describe("offline field-mode model", () => {
  test("messaging by connection state", () => {
    expect(getOfflineModeMessage({ isOnline: true, hasCheckout: false })).toContain("Online");
    expect(getOfflineModeMessage({ isOnline: true, hasCheckout: false, syncQueueLength: 2 })).toContain("2 offline");
    expect(getOfflineModeMessage({ isOnline: false, hasCheckout: true })).toContain("continue");
    expect(getOfflineModeMessage({ isOnline: false, hasCheckout: false })).toContain("read-only");
    expect(isOnlineOnlyFeature("ai")).toBe(true);
    expect(isOnlineOnlyFeature("field-mode")).toBe(false);
  });
});

describe("notification model", () => {
  const notifications = [
    { id: "1", read: false, severity: "info", targetRoles: ["Author"] },
    { id: "2", read: true, severity: "warn", targetRoles: ["Approver"] },
    { id: "3", read: false, severity: "danger", targetRoles: ["*"] }
  ];

  test("counts unread for a role", () => {
    expect(countUnread(notifications, ROLES.AUTHOR)).toBe(2);
    expect(countUnread(notifications, ROLES.APPROVER)).toBe(1);
    expect(countUnread(notifications)).toBe(2);
  });

  test("filters for role", () => {
    expect(filterForRole(notifications, ROLES.AUTHOR)).toHaveLength(2);
    expect(filterForRole(notifications, ROLES.REVIEWER)).toHaveLength(1);
    expect(filterForRole(notifications)).toEqual(notifications);
  });

  test("provides tone classes for severity", () => {
    expect(getNotificationToneClasses("warn")).toContain("amber");
    expect(getNotificationToneClasses("danger")).toContain("red");
    expect(getNotificationToneClasses("info")).toContain("zinc");
    expect(getNotificationToneClasses("unknown")).toContain("zinc");
  });
});

describe("workflow reducer", () => {
  const baseAssessment = { name: "Asset Site 1 — 2026 SRA", facilityName: "Asset Site 1" };
  const draftState = {
    state: ASSESSMENT_STATES.DRAFT,
    version: "v0.7",
    signatureDates: { author: null, reviewer: null, approver: null, approverNote: null },
    sentBack: null,
    reviewerState: null
  };

  test("getInitialAssessmentState seeds signatureDates from approval timestamps", () => {
    const draft = getInitialAssessmentState({ state: ASSESSMENT_STATES.DRAFT });
    expect(draft.state).toBe(ASSESSMENT_STATES.DRAFT);
    expect(draft.signatureDates.author).toBeNull();

    const approved = getInitialAssessmentState({
      state: ASSESSMENT_STATES.APPROVED,
      submittedAt: "2025-09-01T00:00:00Z",
      approvedAt: "2025-09-12T00:00:00Z"
    });
    expect(approved.signatureDates.author).toBe("2025-09-01");
    expect(approved.signatureDates.approver).toBe("2025-09-12");
  });

  test("submit transitions Draft → In Review and stamps author", () => {
    const result = applyWorkflowAction(draftState, {
      type: WORKFLOW_ACTIONS.SUBMIT,
      actor: { name: "Demo Author", role: ROLES.AUTHOR },
      assessment: baseAssessment
    });
    expect(result.error).toBeUndefined();
    expect(result.next.state).toBe(ASSESSMENT_STATES.IN_REVIEW);
    expect(result.next.signatureDates.author).toBeTruthy();
    expect(result.auditEntry.action).toBe("submit");
  });

  test("submit rejects non-Author and non-Draft state", () => {
    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.SUBMIT,
        actor: { name: "A", role: ROLES.REVIEWER },
        assessment: baseAssessment
      }).error
    ).toContain("Author");

    expect(
      applyWorkflowAction(
        { ...draftState, state: ASSESSMENT_STATES.IN_REVIEW },
        {
          type: WORKFLOW_ACTIONS.SUBMIT,
          actor: { name: "Author", role: ROLES.AUTHOR },
          assessment: baseAssessment
        }
      ).error
    ).toContain("Draft");
  });

  test("reviewer-send-back requires reason and resets author", () => {
    const inReview = { ...draftState, state: ASSESSMENT_STATES.IN_REVIEW };
    const blocked = applyWorkflowAction(inReview, {
      type: WORKFLOW_ACTIONS.REVIEWER_SEND_BACK,
      actor: { name: "Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment,
      reason: ""
    });
    expect(blocked.error).toContain("reason");

    const ok = applyWorkflowAction(inReview, {
      type: WORKFLOW_ACTIONS.REVIEWER_SEND_BACK,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment,
      reason: "Needs more detail"
    });
    expect(ok.next.state).toBe(ASSESSMENT_STATES.DRAFT);
    expect(ok.next.sentBack.kind).toBe("reviewer-to-author");
    expect(ok.next.signatureDates.author).toBeNull();
  });

  test("review-complete transitions In Review → Awaiting Approval", () => {
    const inReview = { ...draftState, state: ASSESSMENT_STATES.IN_REVIEW };
    const result = applyWorkflowAction(inReview, {
      type: WORKFLOW_ACTIONS.REVIEW_COMPLETE,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment
    });
    expect(result.next.state).toBe(ASSESSMENT_STATES.AWAITING_APPROVAL);
    expect(result.next.signatureDates.reviewer).toBeTruthy();
  });

  test("approve transitions Awaiting Approval → Approved and freezes version", () => {
    const awaiting = { ...draftState, state: ASSESSMENT_STATES.AWAITING_APPROVAL };
    const result = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.APPROVE,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment,
      note: "Approved with notes"
    });
    expect(result.next.state).toBe(ASSESSMENT_STATES.APPROVED);
    expect(result.next.signatureDates.approver).toBeTruthy();
    expect(result.next.version).toBe("v1.0");
  });

  test("approver-send-back requires reason and clears reviewer signature", () => {
    const awaiting = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      signatureDates: { author: "2026-04-25", reviewer: "2026-04-26", approver: null, approverNote: null }
    };
    const blocked = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.APPROVER_SEND_BACK,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment
    });
    expect(blocked.error).toContain("reason");
    const ok = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.APPROVER_SEND_BACK,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment,
      reason: "Need maritime ratings revisit"
    });
    expect(ok.next.state).toBe(ASSESSMENT_STATES.IN_REVIEW);
    expect(ok.next.signatureDates.reviewer).toBeNull();
    expect(ok.next.sentBack.kind).toBe("approver-to-reviewer");
  });

  test("reject clears all signatures and shows red banner", () => {
    const awaiting = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      signatureDates: { author: "2026-04-25", reviewer: "2026-04-26", approver: null, approverNote: null }
    };
    const ok = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.REJECT,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment,
      reason: "Major rework needed"
    });
    expect(ok.next.state).toBe(ASSESSMENT_STATES.DRAFT);
    expect(ok.next.signatureDates).toEqual({
      author: null,
      reviewer: null,
      approver: null,
      approverNote: null
    });
    expect(ok.next.sentBack.kind).toBe("approver-reject");
  });

  test("Author withdraw goes back to Draft when Reviewer hasn't opened", () => {
    const inReview = {
      ...draftState,
      state: ASSESSMENT_STATES.IN_REVIEW,
      reviewerState: "not-opened",
      signatureDates: { ...draftState.signatureDates, author: "2026-04-25" }
    };
    const result = applyWorkflowAction(inReview, {
      type: WORKFLOW_ACTIONS.WITHDRAW,
      actor: { name: "Demo Author", role: ROLES.AUTHOR },
      assessment: baseAssessment,
      reason: "Spotted a typo"
    });
    expect(result.error).toBeUndefined();
    expect(result.next.state).toBe(ASSESSMENT_STATES.DRAFT);
    expect(result.next.signatureDates.author).toBeNull();
    expect(result.auditEntry.action).toBe("withdraw");
  });

  test("Author withdraw is blocked once Reviewer has opened (must request recall)", () => {
    const opened = {
      ...draftState,
      state: ASSESSMENT_STATES.IN_REVIEW,
      reviewerState: "opened"
    };
    const blocked = applyWorkflowAction(opened, {
      type: WORKFLOW_ACTIONS.WITHDRAW,
      actor: { name: "Author", role: ROLES.AUTHOR },
      assessment: baseAssessment
    });
    expect(blocked.error).toContain("recall");
  });

  test("Reviewer withdraw at Awaiting Approval goes back to In Review when Approver hasn't opened", () => {
    const awaiting = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      approverState: "not-opened",
      signatureDates: { author: "2026-04-25", reviewer: "2026-04-26", approver: null, approverNote: null }
    };
    const result = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.WITHDRAW,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment,
      reason: "Wrong file forwarded"
    });
    expect(result.error).toBeUndefined();
    expect(result.next.state).toBe(ASSESSMENT_STATES.IN_REVIEW);
    expect(result.next.reviewerState).toBe("opened");
    expect(result.next.signatureDates.reviewer).toBeNull();
  });

  test("RECALL_REQUEST sets pendingRecall and tags receiver per requester", () => {
    const inReviewOpened = {
      ...draftState,
      state: ASSESSMENT_STATES.IN_REVIEW,
      reviewerState: "opened"
    };
    const authorRecall = applyWorkflowAction(inReviewOpened, {
      type: WORKFLOW_ACTIONS.RECALL_REQUEST,
      actor: { name: "Demo Author", role: ROLES.AUTHOR },
      assessment: baseAssessment,
      reason: "Found a math error"
    });
    expect(authorRecall.error).toBeUndefined();
    expect(authorRecall.next.pendingRecall).toMatchObject({
      requesterRole: ROLES.AUTHOR,
      receiverRole: ROLES.REVIEWER,
      fromState: ASSESSMENT_STATES.IN_REVIEW
    });
    expect(authorRecall.next.state).toBe(ASSESSMENT_STATES.IN_REVIEW);
    expect(authorRecall.auditEntry.action).toBe("recall-request");

    const awaitingOpened = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      approverState: "opened",
      signatureDates: { author: "2026-04-25", reviewer: "2026-04-26", approver: null, approverNote: null }
    };
    const reviewerRecall = applyWorkflowAction(awaitingOpened, {
      type: WORKFLOW_ACTIONS.RECALL_REQUEST,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment,
      reason: "Maritime ratings need rework"
    });
    expect(reviewerRecall.next.pendingRecall.receiverRole).toBe(ROLES.APPROVER);
  });

  test("RECALL_REQUEST blocks Author after review-complete and blocks anyone after Approved", () => {
    const awaiting = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      approverState: "opened"
    };
    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "Author", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "Need to fix"
      }).error
    ).toContain("Author cannot recall");

    const approved = { ...draftState, state: ASSESSMENT_STATES.APPROVED };
    expect(
      applyWorkflowAction(approved, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "Reviewer", role: ROLES.REVIEWER },
        assessment: baseAssessment,
        reason: "Spotted issue"
      }).error
    ).toContain("Approved");
  });

  test("RECALL_REQUEST blocked when Reviewer has not opened (use withdraw)", () => {
    const notOpened = {
      ...draftState,
      state: ASSESSMENT_STATES.IN_REVIEW,
      reviewerState: "not-opened"
    };
    expect(
      applyWorkflowAction(notOpened, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "Author", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "tweak"
      }).error
    ).toContain("withdraw");
  });

  test("RECALL_APPROVE rolls state back and clears the relevant signature", () => {
    const pendingState = {
      ...draftState,
      state: ASSESSMENT_STATES.IN_REVIEW,
      reviewerState: "opened",
      signatureDates: { author: "2026-04-25", reviewer: null, approver: null, approverNote: null },
      pendingRecall: {
        requesterRole: ROLES.AUTHOR,
        requesterName: "Demo Author",
        receiverRole: ROLES.REVIEWER,
        reason: "fix needed",
        fromState: ASSESSMENT_STATES.IN_REVIEW,
        createdAt: "2026-04-26"
      }
    };
    const blocked = applyWorkflowAction(pendingState, {
      type: WORKFLOW_ACTIONS.RECALL_APPROVE,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment
    });
    expect(blocked.error).toContain("Reviewer");

    const ok = applyWorkflowAction(pendingState, {
      type: WORKFLOW_ACTIONS.RECALL_APPROVE,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment
    });
    expect(ok.next.state).toBe(ASSESSMENT_STATES.DRAFT);
    expect(ok.next.signatureDates.author).toBeNull();
    expect(ok.next.pendingRecall).toBeNull();
    expect(ok.auditEntry.action).toBe("recall-approved");
  });

  test("RECALL_DECLINE clears pendingRecall but keeps state", () => {
    const pendingState = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      approverState: "opened",
      pendingRecall: {
        requesterRole: ROLES.REVIEWER,
        requesterName: "A. Reviewer",
        receiverRole: ROLES.APPROVER,
        reason: "rework",
        fromState: ASSESSMENT_STATES.AWAITING_APPROVAL,
        createdAt: "2026-04-26"
      }
    };
    const declined = applyWorkflowAction(pendingState, {
      type: WORKFLOW_ACTIONS.RECALL_DECLINE,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment,
      reason: "Already approved in spirit"
    });
    expect(declined.next.state).toBe(ASSESSMENT_STATES.AWAITING_APPROVAL);
    expect(declined.next.pendingRecall).toBeNull();
    expect(declined.auditEntry.action).toBe("recall-declined");
  });

  test("REVIEWER_OPENED and APPROVER_OPENED set per-role openness flags", () => {
    const inReview = { ...draftState, state: ASSESSMENT_STATES.IN_REVIEW, reviewerState: "not-opened" };
    const r = applyWorkflowAction(inReview, {
      type: WORKFLOW_ACTIONS.REVIEWER_OPENED,
      actor: { name: "A. Reviewer", role: ROLES.REVIEWER },
      assessment: baseAssessment
    });
    expect(r.next.reviewerState).toBe("opened");

    const awaiting = {
      ...draftState,
      state: ASSESSMENT_STATES.AWAITING_APPROVAL,
      approverState: "not-opened"
    };
    const a = applyWorkflowAction(awaiting, {
      type: WORKFLOW_ACTIONS.APPROVER_OPENED,
      actor: { name: "M. Approver", role: ROLES.APPROVER },
      assessment: baseAssessment
    });
    expect(a.next.approverState).toBe("opened");
  });

  test("unknown action returns error", () => {
    expect(applyWorkflowAction(draftState, { type: "noop", actor: { role: ROLES.AUTHOR }, assessment: baseAssessment }).error).toContain("Unknown");
  });

  test("reducer guards reject the wrong role/state on every transition", () => {
    const inReview = { ...draftState, state: ASSESSMENT_STATES.IN_REVIEW };
    const awaiting = { ...draftState, state: ASSESSMENT_STATES.AWAITING_APPROVAL };
    const approved = { ...draftState, state: ASSESSMENT_STATES.APPROVED };

    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.WITHDRAW,
        actor: { name: "?", role: ROLES.ADMIN },
        assessment: baseAssessment
      }).error
    ).toContain("Author or Reviewer");

    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.WITHDRAW,
        actor: { name: "Author", role: ROLES.AUTHOR },
        assessment: baseAssessment
      }).error
    ).toContain("In Review");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.WITHDRAW,
        actor: { name: "Reviewer", role: ROLES.REVIEWER },
        assessment: baseAssessment
      }).next
    ).toBeDefined();

    expect(
      applyWorkflowAction(
        { ...awaiting, approverState: "opened" },
        {
          type: WORKFLOW_ACTIONS.WITHDRAW,
          actor: { name: "Reviewer", role: ROLES.REVIEWER },
          assessment: baseAssessment
        }
      ).error
    ).toContain("recall");

    expect(
      applyWorkflowAction(inReview, {
        type: WORKFLOW_ACTIONS.REVIEW_COMPLETE,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment
      }).error
    ).toContain("Reviewer");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.REVIEW_COMPLETE,
        actor: { name: "Reviewer", role: ROLES.REVIEWER },
        assessment: baseAssessment
      }).error
    ).toContain("In Review");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.REVIEWER_SEND_BACK,
        actor: { name: "Reviewer", role: ROLES.REVIEWER },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("In Review");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.REVIEWER_SEND_BACK,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Reviewer");

    expect(
      applyWorkflowAction(inReview, {
        type: WORKFLOW_ACTIONS.APPROVE,
        actor: { name: "?", role: ROLES.APPROVER },
        assessment: baseAssessment
      }).error
    ).toContain("Awaiting");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.APPROVE,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment
      }).error
    ).toContain("Approver");

    expect(
      applyWorkflowAction(inReview, {
        type: WORKFLOW_ACTIONS.APPROVER_SEND_BACK,
        actor: { name: "?", role: ROLES.APPROVER },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Awaiting");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.APPROVER_SEND_BACK,
        actor: { name: "?", role: ROLES.REVIEWER },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Approver");

    expect(
      applyWorkflowAction(inReview, {
        type: WORKFLOW_ACTIONS.REJECT,
        actor: { name: "?", role: ROLES.APPROVER },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Awaiting");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.REJECT,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Approver");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.REJECT,
        actor: { name: "?", role: ROLES.APPROVER },
        assessment: baseAssessment
      }).error
    ).toContain("reason");

    expect(
      applyWorkflowAction(approved, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("Approved");

    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("review");

    expect(
      applyWorkflowAction(
        {
          ...inReview,
          reviewerState: "opened",
          pendingRecall: { requesterRole: ROLES.AUTHOR, receiverRole: ROLES.REVIEWER, fromState: ASSESSMENT_STATES.IN_REVIEW }
        },
        {
          type: WORKFLOW_ACTIONS.RECALL_REQUEST,
          actor: { name: "?", role: ROLES.AUTHOR },
          assessment: baseAssessment,
          reason: "x"
        }
      ).error
    ).toContain("already pending");

    expect(
      applyWorkflowAction(
        { ...inReview, reviewerState: "opened" },
        {
          type: WORKFLOW_ACTIONS.RECALL_REQUEST,
          actor: { name: "?", role: ROLES.ADMIN },
          assessment: baseAssessment,
          reason: "x"
        }
      ).error
    ).toContain("Author or Reviewer");

    expect(
      applyWorkflowAction(
        { ...inReview, reviewerState: "opened" },
        {
          type: WORKFLOW_ACTIONS.RECALL_REQUEST,
          actor: { name: "?", role: ROLES.REVIEWER },
          assessment: baseAssessment,
          reason: "x"
        }
      ).error
    ).toContain("Reviewer recall");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.RECALL_REQUEST,
        actor: { name: "?", role: ROLES.REVIEWER },
        assessment: baseAssessment,
        reason: "x"
      }).error
    ).toContain("withdraw");

    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.RECALL_APPROVE,
        actor: { name: "?", role: ROLES.REVIEWER },
        assessment: baseAssessment
      }).error
    ).toContain("No pending");

    expect(
      applyWorkflowAction(draftState, {
        type: WORKFLOW_ACTIONS.RECALL_DECLINE,
        actor: { name: "?", role: ROLES.REVIEWER },
        assessment: baseAssessment
      }).error
    ).toContain("No pending");

    expect(
      applyWorkflowAction(
        {
          ...inReview,
          pendingRecall: { requesterRole: ROLES.AUTHOR, receiverRole: ROLES.REVIEWER, fromState: ASSESSMENT_STATES.IN_REVIEW }
        },
        {
          type: WORKFLOW_ACTIONS.RECALL_DECLINE,
          actor: { name: "?", role: ROLES.AUTHOR },
          assessment: baseAssessment
        }
      ).error
    ).toContain("Reviewer");

    expect(
      applyWorkflowAction(inReview, {
        type: WORKFLOW_ACTIONS.REVIEWER_OPENED,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment
      }).next
    ).toEqual(inReview);

    expect(
      applyWorkflowAction(
        { ...inReview, reviewerState: "opened" },
        {
          type: WORKFLOW_ACTIONS.REVIEWER_OPENED,
          actor: { name: "?", role: ROLES.REVIEWER },
          assessment: baseAssessment
        }
      ).next.reviewerState
    ).toBe("opened");

    expect(
      applyWorkflowAction(awaiting, {
        type: WORKFLOW_ACTIONS.APPROVER_OPENED,
        actor: { name: "?", role: ROLES.AUTHOR },
        assessment: baseAssessment
      }).next
    ).toEqual(awaiting);

    expect(
      applyWorkflowAction(
        { ...awaiting, approverState: "opened" },
        {
          type: WORKFLOW_ACTIONS.APPROVER_OPENED,
          actor: { name: "?", role: ROLES.APPROVER },
          assessment: baseAssessment
        }
      ).next.approverState
    ).toBe("opened");
  });

  test("submit clears pendingRecall and resets reviewer/approver states", () => {
    const dirty = {
      ...draftState,
      state: ASSESSMENT_STATES.DRAFT,
      pendingRecall: { requesterRole: ROLES.AUTHOR, fromState: ASSESSMENT_STATES.IN_REVIEW }
    };
    const result = applyWorkflowAction(dirty, {
      type: WORKFLOW_ACTIONS.SUBMIT,
      actor: { name: "Demo Author", role: ROLES.AUTHOR },
      assessment: baseAssessment
    });
    expect(result.next.pendingRecall).toBeNull();
    expect(result.next.reviewerState).toBe("not-opened");
  });

  test("getInitialAssessmentState seeds approverState from current state", () => {
    const awaiting = getInitialAssessmentState({ state: ASSESSMENT_STATES.AWAITING_APPROVAL });
    expect(awaiting.approverState).toBe("not-opened");
    expect(awaiting.pendingRecall).toBeNull();

    const inReview = getInitialAssessmentState({ state: ASSESSMENT_STATES.IN_REVIEW });
    expect(inReview.reviewerState).toBe("not-opened");
    expect(inReview.approverState).toBeNull();
  });

  test("applyDemoRoleSideEffects forces state per role", () => {
    const draft = applyDemoRoleSideEffects(draftState, ROLES.REVIEWER);
    expect(draft.state).toBe(ASSESSMENT_STATES.IN_REVIEW);
    expect(draft.reviewerState).toBe("opened");

    const approver = applyDemoRoleSideEffects(draftState, ROLES.APPROVER);
    expect(approver.state).toBe(ASSESSMENT_STATES.AWAITING_APPROVAL);
    expect(approver.signatureDates.author).toBeTruthy();
    expect(approver.signatureDates.reviewer).toBeTruthy();

    const owner = applyDemoRoleSideEffects(draftState, ROLES.MITIGATION_OWNER);
    expect(owner.state).toBe(ASSESSMENT_STATES.APPROVED);
    expect(owner.signatureDates.approver).toBeTruthy();

    const noop = applyDemoRoleSideEffects(draftState, ROLES.AUTHOR);
    expect(noop.state).toBe(ASSESSMENT_STATES.DRAFT);
  });
});

describe("audit visibility", () => {
  const entries = [
    { id: "a1", action: "edit", ip: "10.0.0.1", user: "Author" },
    { id: "a2", action: "sign-in", ip: "10.0.0.2", user: "Reviewer" },
    { id: "a3", action: "comment", ip: "10.0.0.3", user: "Reviewer" }
  ];

  test("hides sign-in entries from non-admin viewers", () => {
    const adminVisible = filterAuditEntriesForRole(entries, ROLES.ADMIN);
    expect(adminVisible).toHaveLength(3);

    const authorVisible = filterAuditEntriesForRole(entries, ROLES.AUTHOR);
    expect(authorVisible.find((e) => e.id === "a2")).toBeUndefined();
    expect(authorVisible).toHaveLength(2);

    expect(filterAuditEntriesForRole([], ROLES.AUTHOR)).toEqual([]);
  });

  test("isAdminViewer detects Admin role", () => {
    expect(isAdminViewer(ROLES.ADMIN)).toBe(true);
    expect(isAdminViewer(ROLES.AUTHOR)).toBe(false);
    expect(isAdminViewer(undefined)).toBe(false);
  });

  test("visibleIp returns the IP only for Admin viewers", () => {
    expect(visibleIp(ROLES.ADMIN, "10.0.0.1")).toBe("10.0.0.1");
    expect(visibleIp(ROLES.AUTHOR, "10.0.0.1")).toBeNull();
    expect(visibleIp(ROLES.REVIEWER, undefined)).toBeNull();
  });
});

describe("section validation", () => {
  const baseAssessment = {
    id: "ass-test",
    state: "Draft",
    facilityName: "Asset Site Test",
    executiveSummary: "All good.",
    conclusion: "All good."
  };

  test("returns nine empty buckets when given a healthy assessment", () => {
    const result = validateAssessment({
      assessment: baseAssessment,
      assets: [
        { id: "a1", name: "Asset 1", description: "Solid", criticality: "High" }
      ],
      threats: [{ id: "t1", classification: "Org", rating: "Medium" }],
      evaluations: [
        {
          id: "e1",
          assetId: "a1",
          threatId: "t1",
          scenario: "Theft",
          consequenceR1: 3,
          likelihoodR1: 3
        }
      ],
      mitigations: [
        {
          id: "m1",
          ownerLabel: "Security Manager",
          targetDate: "2026-12-31",
          agreed: "Yes"
        }
      ]
    });
    expect(result[1]).toEqual([]);
    expect(result[3]).toEqual([]);
    expect(result[4]).toEqual([]);
    expect(result[6]).toEqual([]);
    expect(result[7]).toEqual([]);
    expect(result[8]).toEqual([]);
  });

  test("flags missing executive summary, no assets, and missing conclusion", () => {
    const result = validateAssessment({
      assessment: { ...baseAssessment, executiveSummary: "", conclusion: "  " }
    });
    expect(result[1].some((e) => e.code === "exec-empty")).toBe(true);
    expect(result[3].some((e) => e.code === "no-assets")).toBe(true);
    expect(result[8].some((e) => e.code === "conclusion-empty")).toBe(true);
  });

  test("flags assets missing description or criticality", () => {
    const result = validateAssessment({
      assessment: baseAssessment,
      assets: [
        { id: "a1", name: "Asset 1", description: "", criticality: "Low" },
        { id: "a2", name: "Asset 2", description: "ok", criticality: "" }
      ]
    });
    expect(result[3].filter((e) => e.code === "asset-desc")).toHaveLength(1);
    expect(result[3].filter((e) => e.code === "asset-criticality")).toHaveLength(1);
  });

  test("flags threats missing rating and evaluations missing scenario or R1", () => {
    const result = validateAssessment({
      assessment: baseAssessment,
      assets: [{ id: "a1", name: "Asset 1", description: "ok", criticality: "Low" }],
      threats: [
        { id: "t1", classification: "Cyber", rating: "" },
        { id: "t2", classification: "Insider", rating: "Medium" }
      ],
      evaluations: [
        { id: "e1", assetId: "a1", threatId: "t1", scenario: "", consequenceR1: 0, likelihoodR1: 0 }
      ]
    });
    expect(result[4].some((e) => e.code === "threat-rating")).toBe(true);
    expect(result[6].some((e) => e.code === "eval-scenario")).toBe(true);
    expect(result[6].some((e) => e.code === "eval-r1")).toBe(true);
  });

  test("flags mitigations without owner, target, or pending agreement", () => {
    const result = validateAssessment({
      assessment: baseAssessment,
      assets: [{ id: "a1", name: "Asset 1", description: "ok", criticality: "Low" }],
      mitigations: [
        { id: "m1", ownerLabel: "", targetDate: "", agreed: "Pending" }
      ]
    });
    expect(result[7].some((e) => e.code === "mit-owner")).toBe(true);
    expect(result[7].some((e) => e.code === "mit-target")).toBe(true);
    expect(result[7].some((e) => e.code === "mit-agreed")).toBe(true);
  });

  test("returns nine empty buckets when assessment is null", () => {
    const result = validateAssessment({ assessment: null });
    expect(Object.keys(result)).toHaveLength(9);
    Object.values(result).forEach((bucket) => expect(bucket).toEqual([]));
  });
});

describe("commentCountsBySection", () => {
  test("counts comments per sectionId and ignores other actions", () => {
    const audit = [
      { id: "a", action: "comment", sectionId: 6 },
      { id: "b", action: "comment", sectionId: 6 },
      { id: "c", action: "comment", sectionId: 7 },
      { id: "d", action: "edit", sectionId: 6 },
      { id: "e", action: "comment", sectionId: null },
      { id: "f", action: "comment" }
    ];
    expect(commentCountsBySection(audit)).toEqual({ 6: 2, 7: 1 });
    expect(commentCountsBySection([])).toEqual({});
    expect(commentCountsBySection()).toEqual({});
  });
});

describe("ProtectedRoute", () => {
  test("redirects unauthenticated users to login", () => {
    render(
      <MemoryRouter initialEntries={["/private"]}>
        <AuthProvider initialSession={null}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/private" element={<p>Private page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Login page").textContent).toBe("Login page");
  });

  test("allows matching roles and redirects mismatched roles to home", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider initialSession={{ ...demoSession, actingRole: ROLES.ADMIN, roles: [ROLES.ADMIN], demo: false }}>
          <Routes>
            <Route path="/dashboard" element={<p>Dashboard</p>} />
            <Route element={<ProtectedRoute requiredRoles={[ROLES.ADMIN]} />}>
              <Route path="/admin" element={<p>Admin page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Admin page").textContent).toBe("Admin page");
  });

  test("redirects mismatched role to their home route", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider initialSession={{ ...demoSession, demo: false }}>
          <Routes>
            <Route path="/dashboard" element={<p>Author dashboard</p>} />
            <Route element={<ProtectedRoute requiredRoles={[ROLES.ADMIN]} />}>
              <Route path="/admin" element={<p>Admin page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Author dashboard").textContent).toBe("Author dashboard");
  });
});
