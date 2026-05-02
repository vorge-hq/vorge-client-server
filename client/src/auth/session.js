export const ROLES = Object.freeze({
  AUTHOR: "Author",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  HQ_EXECUTIVE: "HQ Executive",
  ADMIN: "Admin",
  MITIGATION_OWNER: "Mitigation Owner"
});

export const ROLE_TONE = Object.freeze({
  [ROLES.AUTHOR]: "bg-blue-50 text-blue-800 border border-blue-200",
  [ROLES.REVIEWER]: "bg-indigo-50 text-indigo-800 border border-indigo-200",
  [ROLES.APPROVER]: "bg-violet-50 text-violet-800 border border-violet-200",
  [ROLES.HQ_EXECUTIVE]: "bg-teal-50 text-teal-800 border border-teal-200",
  [ROLES.ADMIN]: "bg-slate-100 text-slate-800 border border-slate-200",
  [ROLES.MITIGATION_OWNER]: "bg-emerald-50 text-emerald-800 border border-emerald-200"
});

const DEMO_USER = Object.freeze({
  id: "user-omar-haddad",
  name: "Omar Haddad",
  initials: "OH",
  email: "omar.haddad@northstar.example",
  title: "Lead Security Analyst",
  mfaEnabled: true
});

const DEMO_FACILITY = Object.freeze({
  id: "fac-bonny-refinery",
  name: "Bonny Refinery",
  operator: "Northstar Energy",
  region: "Niger Delta, Nigeria"
});

export const DEMO_SESSION = Object.freeze({
  user: DEMO_USER,
  facility: DEMO_FACILITY,
  facilities: [
    DEMO_FACILITY,
    {
      id: "fac-coral-fpso",
      name: "Coral FPSO",
      operator: "Northstar Energy",
      region: "Offshore Mozambique"
    },
    {
      id: "fac-port-azura",
      name: "Port Azura Terminal",
      operator: "Meridian Maritime",
      region: "Mediterranean, Italy"
    }
  ],
  actingRole: ROLES.AUTHOR,
  roles: [ROLES.AUTHOR, ROLES.REVIEWER, ROLES.MITIGATION_OWNER],
  token: "demo-token",
  mfaSatisfied: true
});

export const demoSession = DEMO_SESSION;

export function isAuthenticated(session) {
  return Boolean(session?.token && session?.user);
}

export function canSwitchToRole(session, role) {
  return Boolean(session?.roles?.includes(role));
}

export function canAccessFacility(session, facilityId) {
  return Boolean(session?.facilities?.some((facility) => facility.id === facilityId));
}

export function isRoleMfaRequired(role) {
  return [ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN].includes(role);
}
