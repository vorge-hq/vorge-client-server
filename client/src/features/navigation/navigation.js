import { ROLES } from "../../auth/session";

const NAVIGATION = Object.freeze({
  [ROLES.AUTHOR]: [
    { label: "Home", to: "/dashboard", icon: "home", showInMobileBar: true },
    { label: "Assessments", to: "/assessments", icon: "list", showInMobileBar: true },
    { label: "Tasks", to: "/notifications", icon: "tasks", showInMobileBar: true },
    { label: "Field Mode", to: "/field-mode", icon: "wifi", showInMobileBar: false },
    { label: "Audit", to: "/audit", icon: "audit", showInMobileBar: false }
  ],
  [ROLES.REVIEWER]: [
    { label: "Home", to: "/dashboard", icon: "home", showInMobileBar: true },
    { label: "Review Queue", to: "/assessments", icon: "list", showInMobileBar: true },
    { label: "Tasks", to: "/notifications", icon: "tasks", showInMobileBar: true },
    { label: "Audit", to: "/audit", icon: "audit", showInMobileBar: false }
  ],
  [ROLES.APPROVER]: [
    { label: "Home", to: "/dashboard", icon: "home", showInMobileBar: true },
    { label: "Approval Queue", to: "/assessments", icon: "list", showInMobileBar: true },
    { label: "Audit", to: "/audit", icon: "audit", showInMobileBar: true },
    { label: "Tasks", to: "/notifications", icon: "tasks", showInMobileBar: false }
  ],
  [ROLES.HQ_EXECUTIVE]: [
    { label: "Portfolio", to: "/dashboard", icon: "home", showInMobileBar: true },
    { label: "Assessments", to: "/assessments", icon: "list", showInMobileBar: true },
    { label: "Audit Summary", to: "/audit", icon: "audit", showInMobileBar: true }
  ],
  [ROLES.ADMIN]: [
    { label: "Admin", to: "/admin", icon: "settings", showInMobileBar: true },
    { label: "Audit", to: "/audit", icon: "audit", showInMobileBar: true },
    { label: "Assessments", to: "/assessments", icon: "list", showInMobileBar: true }
  ],
  [ROLES.MITIGATION_OWNER]: [
    { label: "My Mitigations", to: "/mitigations", icon: "check", showInMobileBar: true },
    { label: "Tasks", to: "/notifications", icon: "tasks", showInMobileBar: true }
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
