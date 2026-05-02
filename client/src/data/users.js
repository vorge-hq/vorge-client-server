import { ROLES } from "../auth/session";

export const USERS = Object.freeze([
  {
    id: "user-omar-haddad",
    name: "Omar Haddad",
    initials: "OH",
    email: "omar.haddad@northstar.example",
    title: "Lead Security Analyst",
    mfaEnabled: true,
    roles: [
      { role: ROLES.AUTHOR, facilityId: "fac-bonny-refinery" },
      { role: ROLES.AUTHOR, facilityId: "fac-coral-fpso" },
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-bonny-refinery" }
    ],
    actingRole: ROLES.AUTHOR,
    actingFacilityId: "fac-bonny-refinery"
  },
  {
    id: "user-sarah-okonkwo",
    name: "Sarah Okonkwo",
    initials: "SO",
    email: "sarah.okonkwo@northstar.example",
    title: "Senior Reviewer",
    mfaEnabled: true,
    roles: [
      { role: ROLES.REVIEWER, facilityId: "fac-bonny-refinery" },
      { role: ROLES.REVIEWER, facilityId: "fac-coral-fpso" }
    ],
    actingRole: ROLES.REVIEWER,
    actingFacilityId: "fac-bonny-refinery"
  },
  {
    id: "user-marcus-king",
    name: "Marcus King",
    initials: "MK",
    email: "marcus.king@northstar.example",
    title: "Facility Manager",
    mfaEnabled: true,
    roles: [{ role: ROLES.APPROVER, facilityId: "fac-bonny-refinery" }],
    actingRole: ROLES.APPROVER,
    actingFacilityId: "fac-bonny-refinery"
  },
  {
    id: "user-elena-park",
    name: "Elena Park",
    initials: "EP",
    email: "elena.park@northstar.example",
    title: "VP Operations",
    mfaEnabled: true,
    roles: [
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-bonny-refinery" },
      { role: ROLES.HQ_EXECUTIVE, facilityId: "fac-coral-fpso" }
    ],
    actingRole: ROLES.HQ_EXECUTIVE,
    actingFacilityId: "fac-bonny-refinery"
  },
  {
    id: "user-priya-rao",
    name: "Priya Rao",
    initials: "PR",
    email: "priya.rao@alora.example",
    title: "Platform Administrator",
    mfaEnabled: true,
    roles: [
      { role: ROLES.ADMIN, facilityId: "fac-bonny-refinery" },
      { role: ROLES.ADMIN, facilityId: "fac-coral-fpso" }
    ],
    actingRole: ROLES.ADMIN,
    actingFacilityId: "fac-bonny-refinery"
  },
  {
    id: "user-james-clark",
    name: "James Clark",
    initials: "JC",
    email: "james.clark@vendor.example",
    title: "Security Manager (Mitigation Owner)",
    mfaEnabled: false,
    roles: [
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-bonny-refinery" },
      { role: ROLES.MITIGATION_OWNER, facilityId: "fac-coral-fpso" }
    ],
    actingRole: ROLES.MITIGATION_OWNER,
    actingFacilityId: "fac-bonny-refinery"
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
