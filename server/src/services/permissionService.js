const { ASSESSMENT_STATES, ROLES } = require("./constants");

function canEditAssessmentContent({ actingRole, assessmentState, isLocked = false }) {
  return actingRole === ROLES.AUTHOR && assessmentState === ASSESSMENT_STATES.DRAFT && !isLocked;
}

function canReadAssessment({ actingRole }) {
  return [
    ROLES.AUTHOR,
    ROLES.REVIEWER,
    ROLES.APPROVER,
    ROLES.HQ_EXECUTIVE,
    ROLES.ADMIN,
    ROLES.GUEST
  ].includes(actingRole);
}

function canAccessAssessmentSections({ actingRole }) {
  return actingRole !== ROLES.MITIGATION_OWNER && canReadAssessment({ actingRole });
}

// Export packages an entire assessment into a portable document. On the
// non-attributable shared Guest credential that is a bulk-exfil affordance the
// read-only evaluation use-case does not need, so Guest is excluded here even
// though it can otherwise read sections. For every non-Guest role this is
// identical to canAccessAssessmentSections (see the G-U2 regression table).
function canExportAssessment({ actingRole }) {
  return canAccessAssessmentSections({ actingRole }) && actingRole !== ROLES.GUEST;
}

function canComment({ actingRole, assessmentState, commentScope = "inline" }) {
  if (actingRole === ROLES.REVIEWER) {
    return assessmentState === ASSESSMENT_STATES.IN_REVIEW;
  }

  if (actingRole === ROLES.HQ_EXECUTIVE) {
    return commentScope === "assessment";
  }

  return false;
}

function canViewAudit({ actingRole, level = "summary" }) {
  if (actingRole === ROLES.ADMIN || actingRole === ROLES.APPROVER) {
    return true;
  }

  if (actingRole === ROLES.HQ_EXECUTIVE) {
    return level === "summary";
  }

  if (actingRole === ROLES.AUTHOR || actingRole === ROLES.REVIEWER) {
    return level === "inline";
  }

  return false;
}

function getAssessmentPermissions({ actingRole, assessmentState, isLocked = false }) {
  return {
    canRead: canReadAssessment({ actingRole }),
    canAccessSections: canAccessAssessmentSections({ actingRole }),
    canExport: canExportAssessment({ actingRole }),
    canEditContent: canEditAssessmentContent({ actingRole, assessmentState, isLocked }),
    canInlineComment: canComment({ actingRole, assessmentState, commentScope: "inline" }),
    canAssessmentComment: canComment({ actingRole, assessmentState, commentScope: "assessment" }),
    canViewInlineAudit: canViewAudit({ actingRole, level: "inline" }),
    canViewSummaryAudit: canViewAudit({ actingRole, level: "summary" }),
    canViewFullAudit: canViewAudit({ actingRole, level: "full" })
  };
}

module.exports = {
  canEditAssessmentContent,
  canReadAssessment,
  canAccessAssessmentSections,
  canExportAssessment,
  canComment,
  canViewAudit,
  getAssessmentPermissions
};
