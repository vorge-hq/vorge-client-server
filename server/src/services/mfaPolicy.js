const { ROLES } = require("./constants");

/**
 * Roles that require MFA. Per docs/decisions/chunk-4-mfa.md §Locked
 * decisions #2: hardcoded set, three roles. Per-facility policy editor is
 * deferred to M4-proper (§Deviations #1).
 */
const MFA_REQUIRED_ROLES = new Set([ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN]);

/**
 * Returns true if the user holds ANY MFA-required role across ANY of their
 * facility assignments. Per locked decision NEW-3: login is a property of
 * the user account, not facility context; strictest policy wins.
 */
function requiresMfa(user) {
  if (!user?.roleAssignments) return false;
  return user.roleAssignments.some((assignment) => MFA_REQUIRED_ROLES.has(assignment.role));
}

/**
 * Returns true if the SPECIFIC role string requires MFA. Used by
 * /switch-role to decide whether a non-MFA-required → MFA-required switch
 * needs re-verify.
 */
function roleRequiresMfa(role) {
  return MFA_REQUIRED_ROLES.has(role);
}

module.exports = {
  requiresMfa,
  roleRequiresMfa,
  MFA_REQUIRED_ROLES
};
