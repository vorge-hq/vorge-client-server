const { canAccessFacility } = require("../services/facilityAccessService");

function requireFacilityAccess(getScope = (req) => req.body) {
  return (req, res, next) => {
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
