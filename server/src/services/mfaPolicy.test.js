const mfaPolicy = require("./mfaPolicy");
const { ROLES } = require("./constants");

describe("mfaPolicy.requiresMfa", () => {
  test("returns true when user holds an MFA-required role", () => {
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.APPROVER }] })).toBe(true);
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.HQ_EXECUTIVE }] })).toBe(true);
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.ADMIN }] })).toBe(true);
  });

  test("returns false for users with only non-MFA-required roles", () => {
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.AUTHOR }] })).toBe(false);
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.REVIEWER }] })).toBe(false);
    expect(mfaPolicy.requiresMfa({ roleAssignments: [{ role: ROLES.MITIGATION_OWNER }] })).toBe(false);
  });

  test("returns true when ANY assignment across facilities is MFA-required (strictest wins)", () => {
    const user = {
      roleAssignments: [
        { role: ROLES.AUTHOR, facilityId: "f-1" },
        { role: ROLES.REVIEWER, facilityId: "f-2" },
        { role: ROLES.APPROVER, facilityId: "f-3" }
      ]
    };
    expect(mfaPolicy.requiresMfa(user)).toBe(true);
  });

  // Regression test matching adaeze.okeke's production shape: Author + Admin
  // at the SAME facility. Logically equivalent to the cross-facility test
  // above, but the prod-shape combination deserves its own explicit case.
  test("returns true for Author + Admin assignments at the same facility (prod-shape)", () => {
    const user = {
      roleAssignments: [
        { role: ROLES.AUTHOR, facilityId: "f-1" },
        { role: ROLES.ADMIN, facilityId: "f-1" }
      ]
    };
    expect(mfaPolicy.requiresMfa(user)).toBe(true);
  });

  test("returns false for user with no role assignments", () => {
    expect(mfaPolicy.requiresMfa({ roleAssignments: [] })).toBe(false);
    expect(mfaPolicy.requiresMfa({})).toBe(false);
    expect(mfaPolicy.requiresMfa(null)).toBe(false);
  });
});

describe("mfaPolicy.roleRequiresMfa", () => {
  test("returns true for each MFA-required role", () => {
    expect(mfaPolicy.roleRequiresMfa(ROLES.APPROVER)).toBe(true);
    expect(mfaPolicy.roleRequiresMfa(ROLES.HQ_EXECUTIVE)).toBe(true);
    expect(mfaPolicy.roleRequiresMfa(ROLES.ADMIN)).toBe(true);
  });

  test("returns false for non-MFA roles and unknown strings", () => {
    expect(mfaPolicy.roleRequiresMfa(ROLES.AUTHOR)).toBe(false);
    expect(mfaPolicy.roleRequiresMfa("UNKNOWN")).toBe(false);
    expect(mfaPolicy.roleRequiresMfa(null)).toBe(false);
  });
});
