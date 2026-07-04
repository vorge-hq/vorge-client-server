// P4 · O2 — the shared guard that gives Mitigation Owners 403 on every AI
// endpoint (the §P4 matrix, enforced in one place). No endpoints exist yet in
// O2, so the guard is unit-tested directly; O3–O7 mount it.
const { rejectMitigationOwner } = require("../src/middleware/rejectMitigationOwner");
const { ROLES } = require("../src/services/constants");

describe("rejectMitigationOwner", () => {
  test("rejects a Mitigation Owner with 403 ROLE_NOT_ALLOWED", () => {
    const next = jest.fn();
    rejectMitigationOwner({ actingRole: ROLES.MITIGATION_OWNER }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
    expect(err.code).toBe("ROLE_NOT_ALLOWED");
  });

  test.each([ROLES.AUTHOR, ROLES.REVIEWER, ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN])(
    "lets %s through with no error",
    (role) => {
      const next = jest.fn();
      rejectMitigationOwner({ actingRole: role }, {}, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    }
  );
});
