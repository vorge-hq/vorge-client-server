// Guest side-quest · G3 — the shared 403 guard that makes the "Guest × every AI
// endpoint → 403" (and Guest × MFA-enroll → 403) deny by CONSTRUCTION rather
// than incidentally. The AI handlers already 403 a Guest today via their inner
// Author gate (loadWritableAssessment / the generate-draft actingRole check),
// but that gate exists to protect content writes — a future refactor of it must
// not silently open AI to the shared read-only account. Mounting rejectGuest in
// one place, mirroring rejectMitigationOwner, keeps the guest deny matrix
// (docs/test-specs.md §Guest) holding independently of the handler internals.
const { ROLES } = require("../services/constants");
const { DomainError } = require("../services/domainError");

function rejectGuest(req, _res, next) {
  if (req.actingRole === ROLES.GUEST) {
    return next(
      new DomainError("Guest accounts are read-only and cannot perform this action", 403, "ROLE_NOT_ALLOWED", {
        actualRole: req.actingRole
      })
    );
  }
  return next();
}

module.exports = { rejectGuest };
