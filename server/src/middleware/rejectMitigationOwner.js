// P4 · O2 — the shared 403 guard mounted on EVERY AI endpoint as they land
// (O3–O7). Mitigation Owners are outside-collaborators (§9): they get 403 on any
// AI surface, enforced in one place so the "Mitigation Owner × every AI endpoint
// → 403" matrix (docs/test-specs.md §P4) holds by construction.
const { ROLES } = require("../services/constants");
const { DomainError } = require("../services/domainError");

function rejectMitigationOwner(req, _res, next) {
  if (req.actingRole === ROLES.MITIGATION_OWNER) {
    return next(
      new DomainError("Mitigation Owners cannot use AI features", 403, "ROLE_NOT_ALLOWED", {
        actualRole: req.actingRole
      })
    );
  }
  return next();
}

module.exports = { rejectMitigationOwner };
