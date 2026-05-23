const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const authenticate = require("../../middleware/authenticate");
const { appendAuditLog } = require("../../repositories/auditRepository");
const sessionService = require("../../services/sessionService");
const {
  findUserByEmail,
  firstRoleAssignment,
  hasAssignedRole,
  publicUser
} = require("../../repositories/userRepository");

const router = express.Router();

function signSessionToken({ user, actingRole, sid }) {
  return jwt.sign(
    {
      email: user.email,
      actingRole,
      sid
    },
    env.jwtSecret,
    { subject: user.id, expiresIn: env.jwtExpiresIn }
  );
}

function serializeSession({ user, actingRole, token }) {
  return {
    token,
    user: publicUser(user),
    actingRole,
    roles: user.roles,
    facilities: user.facilities
  };
}

async function auditAuthEvent({ user, actionType, actingRole, req, metadata = {} }) {
  const assignment = firstRoleAssignment(user);

  if (!assignment?.facilityId) {
    return null;
  }

  return appendAuditLog({
    actionType,
    userId: user.id,
    actingRole: actingRole || assignment.role,
    facilityId: assignment.facilityId,
    entityType: "session",
    entityId: user.id,
    metadata: {
      sourceIp: req.ip,
      userAgent: req.headers["user-agent"] || null,
      ...metadata
    },
    traceId: req.traceId
  });
}

router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await findUserByEmail(email);
    const passwordMatches = user ? await bcrypt.compare(password || "", user.passwordHash) : false;

    if (!user || !passwordMatches) {
      if (user) {
        await auditAuthEvent({
          user,
          actionType: "auth.login_failed",
          actingRole: firstRoleAssignment(user)?.role || "Unauthenticated",
          req,
          metadata: { email }
        });
      }

      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    }

    const actingRole = firstRoleAssignment(user)?.role;

    if (!actingRole) {
      return res.status(403).json({ error: { code: "NO_ROLE_ASSIGNED", message: "User has no assigned roles" } });
    }

    const { sid } = await sessionService.issueSession({ user, actingRole, req });

    await auditAuthEvent({ user, actionType: "auth.login", actingRole, req, metadata: { sid } });

    return res.json(serializeSession({
      user,
      actingRole,
      token: signSessionToken({ user, actingRole, sid })
    }));
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, (req, res) => {
  res.json(serializeSession({ user: req.user, actingRole: req.actingRole, token: null }));
});

router.post("/switch-role", authenticate, async (req, res, next) => {
  const { role } = req.body;

  if (!hasAssignedRole(req.user, role)) {
    return res.status(403).json({ error: { code: "ROLE_NOT_ASSIGNED", message: "User is not assigned to that role" } });
  }

  try {
    const { sid, previousSid } = await sessionService.rotateSession({
      user: req.user,
      previousSid: req.tokenSid,
      actingRole: role,
      req
    });

    const targetAssignment = req.user.roleAssignments.find((assignment) => assignment.role === role) || firstRoleAssignment(req.user);

    if (targetAssignment?.facilityId) {
      await appendAuditLog({
        actionType: "auth.role_switched",
        userId: req.user.id,
        actingRole: role,
        facilityId: targetAssignment.facilityId,
        entityType: "session",
        entityId: req.user.id,
        metadata: {
          previousRole: req.actingRole,
          nextRole: role,
          previousSid,
          nextSid: sid,
          sourceIp: req.ip
        },
        traceId: req.traceId
      });
    }

    res.json(serializeSession({
      user: req.user,
      actingRole: role,
      token: signSessionToken({ user: req.user, actingRole: role, sid })
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/logout", authenticate, async (req, res, next) => {
  try {
    await sessionService.revokeSession(req.tokenSid);
    await auditAuthEvent({
      user: req.user,
      actionType: "auth.logout",
      actingRole: req.actingRole,
      req,
      metadata: { sid: req.tokenSid }
    });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
