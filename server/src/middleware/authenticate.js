const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { findUserById, hasAssignedRole } = require("../repositories/userRepository");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
    }

    const actingRole = req.headers["x-acting-role"] || payload.actingRole || user.roleAssignments[0]?.role || null;

    if (!actingRole || !hasAssignedRole(user, actingRole)) {
      return res.status(403).json({
        error: {
          code: "ROLE_NOT_ASSIGNED",
          message: "The requested acting role is not assigned to this user"
        }
      });
    }

    req.user = user;
    req.actingRole = actingRole;
    req.tokenActingRole = payload.actingRole || null;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}

module.exports = authenticate;
