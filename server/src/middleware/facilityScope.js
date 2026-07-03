const db = require("../db/knex");
const { runInFacilityScope } = require("../db/requestScope");
const { facilityScopeFor } = require("../services/facilityAccessService");

// Resolve the acting role to the CONCRETE list of facility ids RLS needs. RLS
// policies key on facility_id only (child tables carry no operator_id), so an
// operator-wide role (HQ Executive, cross-facility Admin) must be expanded to
// every facility under its operator(s) here. Directly-assigned facilities need
// no query.
async function resolveFacilityIds({ user, actingRole }) {
  const { facilityIds, operatorIds } = facilityScopeFor({ user, actingRole });
  if (operatorIds.length === 0) {
    return [...facilityIds];
  }
  // facilities has no RLS policy, so this lookup is safe on the base pool.
  const rows = await db("facilities").whereIn("operator_id", operatorIds).select("id");
  return [...new Set([...facilityIds, ...rows.map((r) => r.id)])];
}

// Express middleware: pins the request's DB work to the acting role's facility
// context so Postgres RLS enforces tenant isolation beneath the repo-layer
// scoping. Must run AFTER `authenticate` (needs req.user + req.actingRole).
//
// It holds a transaction open for the duration of the request and commits when
// the response finishes. Content mutations still open their own inner
// transaction via activeConn().transaction — that becomes a savepoint on this
// connection, so it (a) inherits the facility context and (b) rolls back
// independently on a conflict without discarding the whole request.
function facilityScope(req, res, next) {
  Promise.resolve()
    .then(() => resolveFacilityIds({ user: req.user, actingRole: req.actingRole }))
    .then((facilityIds) =>
      runInFacilityScope(
        facilityIds,
        () =>
          new Promise((resolve) => {
            // Resolve (→ commit) once the response is fully sent or the client
            // hangs up. Write atomicity is owned by the inner savepoint, so a
            // committed read-only request is always safe.
            res.on("finish", resolve);
            res.on("close", resolve);
            next();
          })
      )
    )
    .catch(next);
}

module.exports = facilityScope;
module.exports.resolveFacilityIds = resolveFacilityIds;
