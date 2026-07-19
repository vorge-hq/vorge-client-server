import { ROLES } from "../../auth/session";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";

const NAVIGATION = Object.freeze({
  [ROLES.AUTHOR]: [
    { label: "Assessments", to: "/dashboard", icon: "home", showInMobileBar: true },
    { label: "Active SRA", to: `/assessments/${ACTIVE_ASSESSMENT_ID}/sections/2`, icon: "list", showInMobileBar: true }
  ],
  [ROLES.REVIEWER]: [
    { label: "Review queue", to: "/dashboard", icon: "tasks", showInMobileBar: true },
    { label: "Active review", to: `/assessments/${ACTIVE_ASSESSMENT_ID}/sections/1`, icon: "list", showInMobileBar: true }
  ],
  [ROLES.APPROVER]: [
    { label: "Approval queue", to: "/dashboard", icon: "check", showInMobileBar: true },
    { label: "Active approval", to: `/assessments/${ACTIVE_ASSESSMENT_ID}/sections/1`, icon: "list", showInMobileBar: true }
  ],
  [ROLES.HQ_EXECUTIVE]: [
    { label: "Enterprise", to: "/dashboard", icon: "building", showInMobileBar: true },
    { label: "Drill-down", to: `/assessments/${ACTIVE_ASSESSMENT_ID}/sections/6`, icon: "grid", showInMobileBar: true }
  ],
  [ROLES.ADMIN]: [
    { label: "Admin", to: "/admin", icon: "settings", showInMobileBar: true },
    { label: "Configuration", to: "/admin?tab=matrix", icon: "layers", showInMobileBar: true }
  ],
  [ROLES.MITIGATION_OWNER]: [
    { label: "My mitigations", to: "/mitigations", icon: "check", showInMobileBar: true }
  ],
  // Guest: one entry only — the dashboard, which lists the read-only assessments
  // the server scoped to this guest. No hardcoded ACTIVE_ASSESSMENT_ID deep link
  // (that is a fixture id, wrong in prod, and the guest is prod-only).
  [ROLES.GUEST]: [
    { label: "Assessments", to: "/dashboard", icon: "home", showInMobileBar: true }
  ]
});

export function getNavigationForRole(role) {
  return NAVIGATION[role] || [];
}

export function getMobileNavigationForRole(role) {
  return getNavigationForRole(role).filter((item) => item.showInMobileBar);
}

export function getHomeRouteForRole(role) {
  if (role === ROLES.MITIGATION_OWNER) {
    return "/mitigations";
  }

  if (role === ROLES.ADMIN) {
    return "/admin";
  }

  return "/dashboard";
}
