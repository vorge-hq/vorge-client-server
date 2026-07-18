// §Guest read-only access — G1 unit battery (G-U1…G-U5).
// Plan: docs/plans/guest-viewer-execution-plan.md · Spec: docs/test-specs.md §Guest read-only access.
// Proves the Guest role can READ assessments/sections and NOTHING else, that the
// export-route swap changed Guest only, and that MFA exemption is by absence.

const {
  canReadAssessment,
  canAccessAssessmentSections,
  canExportAssessment,
  canEditAssessmentContent,
  canComment,
  canViewAudit,
  getAssessmentPermissions
} = require("../src/services/permissionService");
const { requiresMfa, roleRequiresMfa, MFA_REQUIRED_ROLES } = require("../src/services/mfaPolicy");
const { ROLES, ASSESSMENT_STATES } = require("../src/services/constants");

const GUEST = ROLES.GUEST;

// The six roles that existed before the Guest side-quest (regression baseline).
const PRE_EXISTING_ROLES = [
  ROLES.AUTHOR,
  ROLES.REVIEWER,
  ROLES.APPROVER,
  ROLES.HQ_EXECUTIVE,
  ROLES.ADMIN,
  ROLES.MITIGATION_OWNER
];

describe("§Guest — permissionService (G-U1…G-U5)", () => {
  test("G-U1 Guest can read assessments + sections, but never comment or view audit", () => {
    expect(GUEST).toBe("Guest"); // the role constant exists

    expect(canReadAssessment({ actingRole: GUEST })).toBe(true);
    expect(canAccessAssessmentSections({ actingRole: GUEST })).toBe(true);

    // No comment permission in any state, either scope.
    for (const state of Object.values(ASSESSMENT_STATES)) {
      for (const commentScope of ["inline", "assessment"]) {
        expect(canComment({ actingRole: GUEST, assessmentState: state, commentScope })).toBe(false);
      }
    }

    // No audit visibility at any level.
    for (const level of ["inline", "summary", "full"]) {
      expect(canViewAudit({ actingRole: GUEST, level })).toBe(false);
    }
  });

  test("G-U2 Guest cannot export; export == old section-access for every pre-existing role", () => {
    expect(canExportAssessment({ actingRole: GUEST })).toBe(false);

    // The export route used to gate on canAccessAssessmentSections. The swap to
    // canExportAssessment must be a no-op for all six pre-existing roles — only
    // Guest changes. This table fails loudly if the helper ever diverges.
    for (const role of PRE_EXISTING_ROLES) {
      expect(canExportAssessment({ actingRole: role })).toBe(
        canAccessAssessmentSections({ actingRole: role })
      );
    }
  });

  test("G-U3 getAssessmentPermissions(Guest) is read-only across the FULL shape", () => {
    // toEqual (not toMatchObject) so a newly-added write flag defaulting true
    // cannot slip past a Guest — vacuous-green guard.
    expect(
      getAssessmentPermissions({ actingRole: GUEST, assessmentState: ASSESSMENT_STATES.DRAFT })
    ).toEqual({
      canRead: true,
      canAccessSections: true,
      canExport: false,
      canEditContent: false,
      canInlineComment: false,
      canAssessmentComment: false,
      canViewInlineAudit: false,
      canViewSummaryAudit: false,
      canViewFullAudit: false
    });
  });

  test("G-U4 Guest is MFA-exempt and did not sneak into MFA_REQUIRED_ROLES", () => {
    const guestOnlyUser = { roleAssignments: [{ role: GUEST, facilityId: "facility-a" }] };
    expect(requiresMfa(guestOnlyUser)).toBe(false);
    expect(roleRequiresMfa(GUEST)).toBe(false);

    // The required set must stay exactly the original three — size AND members.
    // Fails loudly if someone "helpfully" adds Guest (or anything else).
    expect(MFA_REQUIRED_ROLES.size).toBe(3);
    expect([...MFA_REQUIRED_ROLES].sort()).toEqual(
      [ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN].sort()
    );
    expect(MFA_REQUIRED_ROLES.has(GUEST)).toBe(false);
  });

  test("G-U5 Guest cannot edit content, even in Draft", () => {
    expect(
      canEditAssessmentContent({ actingRole: GUEST, assessmentState: ASSESSMENT_STATES.DRAFT })
    ).toBe(false);
  });
});
