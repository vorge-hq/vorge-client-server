import { ROLES } from "../auth/session";

export const USERS = Object.freeze([
  {
    id: "user-demo-author",
    name: "Demo Author",
    initials: "DA",
    email: "demo.author@vantage.local",
    title: "Author",
    mfaEnabled: false,
    roles: [
      { role: ROLES.AUTHOR, facilityId: "fac-1" },
      { role: ROLES.AUTHOR, facilityId: "fac-2" }
    ],
    actingRole: ROLES.AUTHOR,
    actingFacilityId: "fac-1"
  },
  {
    id: "user-a-reviewer",
    name: "A. Reviewer",
    initials: "AR",
    email: "a.reviewer@vantage.local",
    title: "Reviewer",
    mfaEnabled: true,
    roles: [
      { role: ROLES.REVIEWER, facilityId: "fac-1" },
      { role: ROLES.REVIEWER, facilityId: "fac-2" },
      { role: ROLES.REVIEWER, facilityId: "fac-3" }
    ],
    actingRole: ROLES.REVIEWER,
    actingFacilityId: "fac-1"
  },
  {
    id: "user-m-approver",
    name: "M. Approver",
    initials: "MA",
    email: "m.approver@vantage.local",
    title: "Approver",
    mfaEnabled: true,
    roles: [
      { role: ROLES.APPROVER, facilityId: "fac-1" },
      { role: ROLES.APPROVER, facilityId: "fac-2" }
    ],
    actingRole: ROLES.APPROVER,
    actingFacilityId: "fac-1"
  },
  {
    id: "user-demo-exec",
    name: "Demo Executive",
    initials: "DE",
    email: "demo.exec@vantage.local",
    title: "HQ Executive",
    mfaEnabled: true,
    roles: [
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-1" },
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-2" },
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-3" },
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-4" },
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-5" }
    ],
    actingRole: ROLES.HQ_EXECUTIVE,
    actingFacilityId: "fac-1"
  },
  {
    id: "user-demo-admin",
    name: "Demo Admin",
    initials: "DA",
    email: "demo.admin@vantage.local",
    title: "Administrator",
    mfaEnabled: true,
    roles: [
      { role: ROLES.ADMIN, facilityId: "fac-1" },
      { role: ROLES.ADMIN, facilityId: "fac-2" },
      { role: ROLES.ADMIN, facilityId: "fac-3" }
    ],
    actingRole: ROLES.ADMIN,
    actingFacilityId: "fac-1"
  },
  {
    id: "user-j-doe",
    name: "J. Doe",
    initials: "JD",
    email: "j.doe@operator-a.com",
    title: "IT Security",
    mfaEnabled: false,
    roles: [
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-1" },
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-2" },
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-3" }
    ],
    actingRole: ROLES.MITIGATION_OWNER,
    actingFacilityId: "fac-1"
  }
]);

export function getUser(userId) {
  return USERS.find((user) => user.id === userId);
}

export function getUsersWithRoleAtFacility(role, facilityId) {
  return USERS.filter((user) =>
    user.roles.some((assignment) => assignment.role === role && assignment.facilityId === facilityId)
  );
}
