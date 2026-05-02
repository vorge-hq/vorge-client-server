function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.actingRole || !allowedRoles.includes(req.actingRole)) {
      return res.status(403).json({
        error: {
          code: "ROLE_NOT_ALLOWED",
          message: "The acting role cannot perform this action",
          allowedRoles
        }
      });
    }

    return next();
  };
}

module.exports = authorizeRole;
