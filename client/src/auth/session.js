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
  [ROLES.ADMIN]: "bg-zinc-100 text-zinc-800 border border-zinc-200",
  [ROLES.MITIGATION_OWNER]: "bg-emerald-50 text-emerald-800 border border-emerald-200"
});

const DEMO_USER = Object.freeze({
  id: "user-demo-author",
  name: "Demo Author",
  initials: "DA",
  email: "demo.author@vantage.local",
  title: "Author",
  mfaEnabled: false
});

const DEMO_FACILITY = Object.freeze({
  id: "fac-1",
  name: "Asset Site 1",
  operator: "Operator A",
  region: "Lagos, Nigeria",
  displayName: "Operator A — Lagos Refinery"
});

export const DEMO_SESSION = Object.freeze({
  user: DEMO_USER,
  facility: DEMO_FACILITY,
  facilities: [
    DEMO_FACILITY,
    {
      id: "fac-2",
      name: "Asset Site 2",
      operator: "Operator A",
      region: "Rivers State, Nigeria",
      displayName: "Operator A — Bonny Terminal"
    },
    {
      id: "fac-3",
      name: "Asset Site 3",
      operator: "Operator A",
      region: "Rivers State, Nigeria",
      displayName: "Operator A — Port Harcourt Depot"
    }
  ],
  actingRole: ROLES.AUTHOR,
  roles: [ROLES.AUTHOR, ROLES.REVIEWER, ROLES.MITIGATION_OWNER],
  token: "demo-token",
  mfaSatisfied: true,
  demo: true
});

export const demoSession = DEMO_SESSION;

export function isAuthenticated(session) {
  return Boolean(session?.token && session?.user);
}

export function canSwitchToRole(session, role) {
  return Boolean(session?.roles?.includes(role));
}

export function canDemoSwitchToRole(session, role) {
  if (!session) return false;
  if (session.demo) return Object.values(ROLES).includes(role);
  return canSwitchToRole(session, role);
}

export const DEMO_PERSONAS = Object.freeze({
  [ROLES.AUTHOR]: {
    userId: "user-demo-author",
    name: "Demo Author",
    initials: "DA",
    email: "demo.author@vantage.local",
    title: "Author",
    mfaEnabled: false,
    home: "/dashboard"
  },
  [ROLES.REVIEWER]: {
    userId: "user-a-reviewer",
    name: "A. Reviewer",
    initials: "AR",
    email: "a.reviewer@vantage.local",
    title: "Reviewer",
    mfaEnabled: true,
    home: "/dashboard"
  },
  [ROLES.APPROVER]: {
    userId: "user-m-approver",
    name: "M. Approver",
    initials: "MA",
    email: "m.approver@vantage.local",
    title: "Approver",
    mfaEnabled: true,
    home: "/dashboard"
  },
  [ROLES.HQ_EXECUTIVE]: {
    userId: "user-demo-exec",
    name: "Demo Executive",
    initials: "DE",
    email: "demo.exec@vantage.local",
    title: "HQ Executive",
    mfaEnabled: true,
    home: "/dashboard"
  },
  [ROLES.ADMIN]: {
    userId: "user-demo-admin",
    name: "Demo Admin",
    initials: "DA",
    email: "demo.admin@vantage.local",
    title: "Administrator",
    mfaEnabled: true,
    home: "/admin"
  },
  [ROLES.MITIGATION_OWNER]: {
    userId: "user-j-doe",
    name: "J. Doe",
    initials: "JD",
    email: "j.doe@operator-a.com",
    title: "IT Security",
    mfaEnabled: false,
    home: "/mitigations"
  }
});

export function getDemoPersona(role) {
  return DEMO_PERSONAS[role] || null;
}

export function canAccessFacility(session, facilityId) {
  return Boolean(session?.facilities?.some((facility) => facility.id === facilityId));
}

export function isRoleMfaRequired(role) {
  return [ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN].includes(role);
}
