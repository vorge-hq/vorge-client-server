const { ACTIONS, listAllowedWorkflowActions, transitionAssessment } = require("../src/services/assessmentStateMachine");
const {
  canAccessAssessmentSections,
  canComment,
  canEditAssessmentContent,
  canReadAssessment,
  canViewAudit,
  getAssessmentPermissions
} = require("../src/services/permissionService");
const { canAccessFacility, filterFacilityScopedRecords, hasFacilityRole, facilityScopeFor } = require("../src/services/facilityAccessService");
const { transitionMitigation } = require("../src/services/mitigationWorkflowService");
const { calculateRiskRating, getBand } = require("../src/services/riskMatrixService");
const { appendAuditEntry, createAuditEntry, hashAuditEntry } = require("../src/services/auditService");
const { createMitigationFromEvaluation, syncEvaluationsForLinks } = require("../src/services/sectionRelationshipService");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../src/services/constants");

describe("assessmentStateMachine", () => {
  test("supports all valid lifecycle transitions", () => {
    const now = new Date("2026-05-02T12:00:00.000Z");

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.DRAFT,
        actingRole: ROLES.AUTHOR,
        action: ACTIONS.SUBMIT_FOR_REVIEW,
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.IN_REVIEW, auditAction: "assessment.submitted_for_review" });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.AUTHOR,
        action: ACTIONS.WITHDRAW_TO_DRAFT,
        reason: "Need to add field notes",
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.DRAFT, reason: "Need to add field notes" });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.REVIEWER,
        action: ACTIONS.SEND_BACK_TO_AUTHOR,
        reason: "Clarify assumptions",
        now
      }).signatureEffects
    ).toEqual({ author: "clear", reviewer: "clear", approver: "clear" });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.REVIEWER,
        action: ACTIONS.COMPLETE_REVIEW,
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.AWAITING_APPROVAL });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.REVIEWER,
        action: ACTIONS.RECALL_REVIEW_COMPLETION,
        reason: "New issue found",
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.IN_REVIEW });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.APPROVER,
        action: ACTIONS.APPROVE,
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.APPROVED });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.APPROVER,
        action: ACTIONS.SEND_BACK_TO_REVIEWER,
        reason: "Reviewer needs to address HQ comment",
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.IN_REVIEW });

    expect(
      transitionAssessment({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.APPROVER,
        action: ACTIONS.REJECT_TO_DRAFT,
        reason: "Risk treatment not acceptable",
        now
      })
    ).toMatchObject({ to: ASSESSMENT_STATES.DRAFT });
  });

  test("rejects unknown, wrong-state, wrong-role, and missing-reason transitions", () => {
    expect(() =>
      transitionAssessment({
        state: ASSESSMENT_STATES.DRAFT,
        actingRole: ROLES.AUTHOR,
        action: "publish"
      })
    ).toThrow("Unknown assessment workflow action");

    expect(() =>
      transitionAssessment({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.AUTHOR,
        action: ACTIONS.SUBMIT_FOR_REVIEW
      })
    ).toThrow("Cannot submit_for_review");

    expect(() =>
      transitionAssessment({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.AUTHOR,
        action: ACTIONS.APPROVE
      })
    ).toThrow("Author cannot perform");

    expect(() =>
      transitionAssessment({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.REVIEWER,
        action: ACTIONS.SEND_BACK_TO_AUTHOR,
        reason: " "
      })
    ).toThrow("reason is required");
  });

  test("lists allowed workflow actions by state and role", () => {
    expect(
      listAllowedWorkflowActions({
        state: ASSESSMENT_STATES.IN_REVIEW,
        actingRole: ROLES.REVIEWER
      })
    ).toEqual([ACTIONS.SEND_BACK_TO_AUTHOR, ACTIONS.COMPLETE_REVIEW]);

    expect(
      listAllowedWorkflowActions({
        state: ASSESSMENT_STATES.APPROVED,
        actingRole: ROLES.AUTHOR
      })
    ).toEqual([]);
  });
});

describe("permissionService", () => {
  test("enforces role and state content permissions", () => {
    expect(canEditAssessmentContent({ actingRole: ROLES.AUTHOR, assessmentState: ASSESSMENT_STATES.DRAFT })).toBe(true);
    expect(canEditAssessmentContent({ actingRole: ROLES.AUTHOR, assessmentState: ASSESSMENT_STATES.DRAFT, isLocked: true })).toBe(false);
    expect(canEditAssessmentContent({ actingRole: ROLES.REVIEWER, assessmentState: ASSESSMENT_STATES.DRAFT })).toBe(false);
    expect(canEditAssessmentContent({ actingRole: ROLES.AUTHOR, assessmentState: ASSESSMENT_STATES.APPROVED })).toBe(false);
  });

  test("keeps Mitigation Owner out of assessment sections and mutations", () => {
    expect(canReadAssessment({ actingRole: ROLES.MITIGATION_OWNER })).toBe(false);
    expect(canAccessAssessmentSections({ actingRole: ROLES.MITIGATION_OWNER })).toBe(false);
    expect(canAccessAssessmentSections({ actingRole: ROLES.ADMIN })).toBe(true);
  });

  test("models comments and audit visibility by role", () => {
    expect(canComment({ actingRole: ROLES.REVIEWER, assessmentState: ASSESSMENT_STATES.IN_REVIEW })).toBe(true);
    expect(canComment({ actingRole: ROLES.REVIEWER, assessmentState: ASSESSMENT_STATES.DRAFT })).toBe(false);
    expect(canComment({ actingRole: ROLES.HQ_EXECUTIVE, assessmentState: ASSESSMENT_STATES.APPROVED, commentScope: "assessment" })).toBe(true);
    expect(canComment({ actingRole: ROLES.HQ_EXECUTIVE, assessmentState: ASSESSMENT_STATES.APPROVED, commentScope: "inline" })).toBe(false);
    expect(canComment({ actingRole: ROLES.AUTHOR, assessmentState: ASSESSMENT_STATES.DRAFT })).toBe(false);

    expect(canViewAudit({ actingRole: ROLES.ADMIN, level: "full" })).toBe(true);
    expect(canViewAudit({ actingRole: ROLES.APPROVER, level: "full" })).toBe(true);
    expect(canViewAudit({ actingRole: ROLES.HQ_EXECUTIVE, level: "summary" })).toBe(true);
    expect(canViewAudit({ actingRole: ROLES.HQ_EXECUTIVE, level: "full" })).toBe(false);
    expect(canViewAudit({ actingRole: ROLES.AUTHOR, level: "inline" })).toBe(true);
    expect(canViewAudit({ actingRole: ROLES.REVIEWER, level: "inline" })).toBe(true);
    expect(canViewAudit({ actingRole: ROLES.AUTHOR })).toBe(false);
    expect(canViewAudit({ actingRole: ROLES.MITIGATION_OWNER, level: "summary" })).toBe(false);
  });

  test("returns a client-consumable permission shape", () => {
    expect(
      getAssessmentPermissions({
        actingRole: ROLES.AUTHOR,
        assessmentState: ASSESSMENT_STATES.DRAFT
      })
    ).toMatchObject({
      canRead: true,
      canAccessSections: true,
      canEditContent: true,
      canInlineComment: false
    });
  });
});

describe("facilityAccessService", () => {
  const user = {
    roleAssignments: [
      { role: ROLES.AUTHOR, facilityId: "facility-a", operatorId: "operator-1" },
      { role: ROLES.REVIEWER, facilityIds: ["facility-b"], operatorId: "operator-1" },
      { role: ROLES.HQ_EXECUTIVE, operatorId: "operator-1" },
      { role: ROLES.ADMIN, operatorId: "operator-1", crossFacility: true }
    ]
  };

  test("detects direct and grouped facility roles", () => {
    expect(hasFacilityRole({ user, facilityId: "facility-a", role: ROLES.AUTHOR })).toBe(true);
    expect(hasFacilityRole({ user, facilityId: "facility-a" })).toBe(true);
    expect(hasFacilityRole({ user, facilityId: "facility-b", role: ROLES.REVIEWER })).toBe(true);
    expect(hasFacilityRole({ user, facilityId: "facility-c", role: ROLES.AUTHOR })).toBe(false);
    expect(hasFacilityRole({ user: {}, facilityId: "facility-a", role: ROLES.AUTHOR })).toBe(false);
  });

  test("enforces direct, HQ, Admin, null, and cross-operator access rules", () => {
    expect(canAccessFacility({ user, facilityId: "facility-a", operatorId: "operator-1", actingRole: ROLES.AUTHOR })).toBe(true);
    expect(canAccessFacility({ user, facilityId: "facility-z", operatorId: "operator-1", actingRole: ROLES.HQ_EXECUTIVE })).toBe(true);
    expect(canAccessFacility({ user, facilityId: "facility-z", operatorId: "operator-1", actingRole: ROLES.ADMIN })).toBe(true);
    expect(canAccessFacility({ user, facilityId: "facility-z", operatorId: "operator-2", actingRole: ROLES.HQ_EXECUTIVE })).toBe(false);
    expect(canAccessFacility({ user, facilityId: "facility-z", operatorId: "operator-2", actingRole: ROLES.ADMIN })).toBe(false);
    expect(canAccessFacility({ user: null, facilityId: "facility-a", operatorId: "operator-1", actingRole: ROLES.AUTHOR })).toBe(false);
    expect(canAccessFacility({ user, facilityId: null, operatorId: "operator-1", actingRole: ROLES.AUTHOR })).toBe(false);
    expect(canAccessFacility({ user, facilityId: "facility-z", operatorId: "operator-1", actingRole: ROLES.APPROVER })).toBe(false);
  });

  test("filters facility-scoped records", () => {
    expect(
      filterFacilityScopedRecords({
        user,
        actingRole: ROLES.AUTHOR,
        records: [
          { id: "a", facilityId: "facility-a", operatorId: "operator-1" },
          { id: "b", facilityId: "facility-b", operatorId: "operator-1" }
        ]
      }).map((record) => record.id)
    ).toEqual(["a"]);
  });

  describe("facilityScopeFor", () => {
    const scopeUser = {
      roleAssignments: [
        { role: ROLES.AUTHOR, facilityId: "facility-a", operatorId: "operator-1" },
        { role: ROLES.AUTHOR, facilityId: "facility-a", operatorId: "operator-1" }, // dup → deduped
        { role: ROLES.HQ_EXECUTIVE, facilityId: "facility-a", operatorId: "operator-1" },
        { role: ROLES.ADMIN, facilityId: "facility-a", operatorId: "operator-1", crossFacility: true },
        { role: ROLES.ADMIN, facilityId: "facility-x", operatorId: "operator-9", crossFacility: false }
      ]
    };

    test("facility-scoped role → its assigned facilities, deduped, no operators", () => {
      expect(facilityScopeFor({ user: scopeUser, actingRole: ROLES.AUTHOR })).toEqual({
        facilityIds: ["facility-a"],
        operatorIds: []
      });
    });

    test("HQ Executive → its operator(s)", () => {
      expect(facilityScopeFor({ user: scopeUser, actingRole: ROLES.HQ_EXECUTIVE })).toEqual({
        facilityIds: ["facility-a"],
        operatorIds: ["operator-1"]
      });
    });

    test("cross-facility Admin → its operator(s); non-cross-facility Admin contributes no operator", () => {
      // operator-9's admin row has crossFacility:false → excluded from operatorIds.
      expect(facilityScopeFor({ user: scopeUser, actingRole: ROLES.ADMIN })).toEqual({
        facilityIds: ["facility-a", "facility-x"],
        operatorIds: ["operator-1"]
      });
    });

    test("no assignments / no user → empty scope (default-deny)", () => {
      expect(facilityScopeFor({ user: {}, actingRole: ROLES.AUTHOR })).toEqual({ facilityIds: [], operatorIds: [] });
      expect(facilityScopeFor({ user: null, actingRole: ROLES.HQ_EXECUTIVE })).toEqual({ facilityIds: [], operatorIds: [] });
    });
  });
});

describe("mitigationWorkflowService", () => {
  const base = {
    role: ROLES.MITIGATION_OWNER,
    assessmentState: ASSESSMENT_STATES.APPROVED,
    isAssigned: true,
    hasFacilityAccess: true
  };

  test("allows Open to In Progress and note-only updates", () => {
    expect(
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.OPEN,
        nextStatus: MITIGATION_STATUSES.IN_PROGRESS
      })
    ).toMatchObject({ status: MITIGATION_STATUSES.IN_PROGRESS, note: null, auditAction: "mitigation.started" });

    expect(
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.OPEN,
        nextStatus: MITIGATION_STATUSES.OPEN,
        note: "Checked with engineering"
      })
    ).toMatchObject({ status: MITIGATION_STATUSES.OPEN, note: "Checked with engineering", auditAction: "mitigation.note_added" });

    expect(
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.OPEN,
        nextStatus: MITIGATION_STATUSES.OPEN
      })
    ).toMatchObject({ auditAction: "mitigation.no_change" });
  });

  test("requires notes for Done and treats Done as terminal", () => {
    expect(() =>
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.IN_PROGRESS,
        nextStatus: MITIGATION_STATUSES.DONE,
        note: " "
      })
    ).toThrow("progress note is required");

    expect(
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.IN_PROGRESS,
        nextStatus: MITIGATION_STATUSES.DONE,
        note: "Installed and verified"
      })
    ).toMatchObject({ status: MITIGATION_STATUSES.DONE, auditAction: "mitigation.completed" });

    expect(() =>
      transitionMitigation({
        ...base,
        currentStatus: MITIGATION_STATUSES.DONE,
        nextStatus: MITIGATION_STATUSES.IN_PROGRESS,
        note: "Reopen"
      })
    ).toThrow("Done is terminal");
  });

  test("rejects wrong role, scope, non-approved, and invalid jumps", () => {
    expect(() =>
      transitionMitigation({ ...base, role: ROLES.AUTHOR, currentStatus: MITIGATION_STATUSES.OPEN, nextStatus: MITIGATION_STATUSES.IN_PROGRESS })
    ).toThrow("Only Mitigation Owners");

    expect(() =>
      transitionMitigation({ ...base, isAssigned: false, currentStatus: MITIGATION_STATUSES.OPEN, nextStatus: MITIGATION_STATUSES.IN_PROGRESS })
    ).toThrow("outside the user's assignment");

    expect(() =>
      transitionMitigation({
        ...base,
        assessmentState: ASSESSMENT_STATES.IN_REVIEW,
        currentStatus: MITIGATION_STATUSES.OPEN,
        nextStatus: MITIGATION_STATUSES.IN_PROGRESS
      })
    ).toThrow("after approval");

    expect(() =>
      transitionMitigation({ ...base, hasFacilityAccess: false, currentStatus: MITIGATION_STATUSES.OPEN, nextStatus: MITIGATION_STATUSES.IN_PROGRESS })
    ).toThrow("outside the user's assignment");

    expect(() =>
      transitionMitigation({ ...base, currentStatus: MITIGATION_STATUSES.OPEN, nextStatus: MITIGATION_STATUSES.DONE, note: "Done" })
    ).toThrow("Invalid mitigation transition");
  });
});

describe("riskMatrixService", () => {
  test("calculates configurable risk bands and blank consequence zero ratings", () => {
    expect(calculateRiskRating({ consequence: 4, likelihood: 5 })).toEqual({ score: 20, band: "Very High" });
    expect(calculateRiskRating({ consequence: "0", likelihood: 5 })).toEqual({ score: null, band: null });
    expect(getBand(100, [{ min: 1, max: 10, label: "Configured" }])).toBeNull();
    expect(calculateRiskRating({ consequence: 2, likelihood: 2, bands: [{ min: 1, max: 4, label: "Custom Low" }] })).toEqual({
      score: 4,
      band: "Custom Low"
    });
  });

  test("rejects invalid matrix inputs", () => {
    expect(() => calculateRiskRating({ consequence: "high", likelihood: 2 })).toThrow("must be integers");
    expect(() => calculateRiskRating({ consequence: 6, likelihood: 2 })).toThrow("within the configured");
  });
});

describe("auditService", () => {
  const event = {
    actionType: "assessment.review_completed",
    userId: "user-1",
    actingRole: ROLES.REVIEWER,
    facilityId: "facility-1",
    assessmentId: "assessment-1",
    entityType: "assessment",
    entityId: "assessment-1",
    diff: { state: ["In Review", "Awaiting Approval"] },
    metadata: { source: "test" },
    traceId: "trace-1",
    timestamp: new Date("2026-05-02T12:00:00.000Z")
  };

  test("creates immutable hash-chained audit entries", () => {
    const first = createAuditEntry(event);
    const minimal = createAuditEntry({
      actionType: "auth.login",
      userId: "user-1",
      actingRole: ROLES.AUTHOR,
      facilityId: "facility-1",
      entityType: "session",
      traceId: "trace-minimal"
    });
    const second = appendAuditEntry([first], { ...event, actionType: "assessment.approved", traceId: "trace-2" })[1];
    const firstFromAppend = appendAuditEntry([], event)[0];

    expect(Object.isFrozen(first)).toBe(true);
    expect(minimal).toMatchObject({ assessmentId: null, entityId: null, diff: null, metadata: {}, previousHash: null });
    expect(first.hash).toHaveLength(64);
    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
    expect(firstFromAppend.previousHash).toBeNull();
    expect(hashAuditEntry(["a", "b"])).toHaveLength(64);
    expect(hashAuditEntry({ b: 2, a: 1 })).toBe(hashAuditEntry({ a: 1, b: 2 }));
  });

  test("requires core audit fields", () => {
    expect(() => createAuditEntry({ ...event, actionType: "" })).toThrow("Missing required audit fields");
  });
});

describe("sectionRelationshipService", () => {
  test("syncs evaluations from enabled Asset x Threat links", () => {
    const result = syncEvaluationsForLinks({
      links: [
        { assetId: "asset-1", threatId: "threat-1", enabled: true },
        { assetId: "asset-2", threatId: "threat-1", enabled: false },
        { assetId: "asset-3", threatId: "threat-1", enabled: true }
      ],
      evaluations: [
        { assetId: "asset-1", threatId: "threat-1", scenario: "Keep me" },
        { assetId: "asset-2", threatId: "threat-1", scenario: "Remove me" }
      ]
    });

    expect(result.createdCount).toBe(1);
    expect(result.removedCount).toBe(1);
    expect(result.evaluations.map((evaluation) => `${evaluation.assetId}:${evaluation.threatId}`)).toEqual([
      "asset-1:threat-1",
      "asset-3:threat-1"
    ]);
  });

  test("creates mitigations from evaluations", () => {
    expect(() => createMitigationFromEvaluation({ evaluation: null })).toThrow("Evaluation is required");
    expect(syncEvaluationsForLinks({ links: [{ assetId: "asset-1", threatId: "threat-1", enabled: true }] })).toMatchObject({
      createdCount: 1,
      removedCount: 0
    });

    expect(
      createMitigationFromEvaluation({
        evaluation: {
          id: "evaluation-1",
          assessmentId: "assessment-1",
          facilityId: "facility-1",
          proposedMitigation: "Install barriers",
          r1: { band: "High" }
        },
        ownerLabel: "Security Manager",
        targetDate: "2026-12-31"
      })
    ).toMatchObject({
      evaluationId: "evaluation-1",
      description: "Install barriers",
      severity: "High",
      agreed: "Pending",
      ownerLabel: "Security Manager",
      status: "Open",
      progressLogs: []
    });

    expect(
      createMitigationFromEvaluation({
        evaluation: {
          id: "evaluation-2",
          assessmentId: "assessment-1",
          facilityId: "facility-1"
        }
      })
    ).toMatchObject({
      description: "",
      severity: null,
      ownerLabel: null,
      targetDate: null
    });
  });
});
