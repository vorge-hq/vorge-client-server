const jwt = require("jsonwebtoken");
const env = require("../config/env");
const sessionService = require("../services/sessionService");
const sessionRepository = require("../repositories/sessionRepository");
const { findUserById, hasAssignedRole } = require("../repositories/userRepository");

const MFA_PATH_PREFIX = "/api/auth/mfa";
const MFA_ENROLL_PREFIX = "/api/auth/mfa/enroll";

function isMfaPath(req) {
  return req.originalUrl.startsWith(MFA_PATH_PREFIX) || req.path.startsWith("/mfa");
}

function isMfaEnrollPath(req) {
  return req.originalUrl.startsWith(MFA_ENROLL_PREFIX) || req.path.startsWith("/mfa/enroll");
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });

    if (!payload.sid) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
    }

    try {
      await sessionService.validateSession(payload.sid, new Date());
    } catch (sessionError) {
      if (sessionError.code === "INVALID_TOKEN") {
        return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
      }
      throw sessionError;
    }

    // Load the session row to surface MFA gates. Re-querying after validate
    // is cheap and keeps validate's "is active" check intact.
    const sessionRow = await sessionRepository.findSessionById(payload.sid);

    const user = await findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
    }

    // Acting role is bound to the signed token claim (set at login / rotated by
    // /switch-role). It is NOT taken from a request header — an untrusted header
    // would let a user act under any assigned role outside the audited
    // switch-role flow.
    const actingRole = payload.actingRole || user.roleAssignments[0]?.role || null;

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
    req.tokenSid = payload.sid;
    req.session = sessionRow;

    // MFA gates. Apply AFTER user/role resolution so the user object is set
    // and the rejected request is auditable.
    if (sessionRow) {
      // must_reenroll: only the MFA enrollment endpoints are accessible.
      if (sessionRow.mustReenroll && !isMfaEnrollPath(req)) {
        return res.status(403).json({
          error: {
            code: "MFA_REENROLLMENT_REQUIRED",
            message: "Re-enrollment is required after recovery-code login"
          }
        });
      }
      // mfa_satisfied=false: only MFA endpoints are accessible.
      if (!sessionRow.mfaSatisfied && !isMfaPath(req)) {
        return res.status(403).json({
          error: {
            code: "MFA_REQUIRED",
            message: "Multi-factor authentication required"
          }
        });
      }
    }

    return next();
  } catch (_error) {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}

module.exports = authenticate;
