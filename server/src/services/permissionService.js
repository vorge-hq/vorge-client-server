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
    ROLES.ADMIN
  ].includes(actingRole);
}

function canAccessAssessmentSections({ actingRole }) {
  return actingRole !== ROLES.MITIGATION_OWNER && canReadAssessment({ actingRole });
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
  canComment,
  canViewAudit,
  getAssessmentPermissions
};
