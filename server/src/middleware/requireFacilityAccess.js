const { canAccessFacility } = require("../services/facilityAccessService");

function requireFacilityAccess(getScope = (req) => req.body) {
  // Named (not anonymous) so the P2 route-guard introspection test
  // (tests/middlewareCoverage.test.js) can detect this guard when it walks
  // app._router.stack. Do not rename without updating that test's constant.
  return function requireFacilityAccessMiddleware(req, res, next) {
    const scope = getScope(req);
    const allowed = canAccessFacility({
      user: req.user,
      actingRole: req.actingRole,
      facilityId: scope.facilityId,
      operatorId: scope.operatorId
    });

    if (!allowed) {
      return res.status(403).json({
        error: {
          code: "FACILITY_ACCESS_DENIED",
          message: "The requested facility is outside the user's access scope"
        }
      });
    }

    return next();
  };
}

module.exports = requireFacilityAccess;
