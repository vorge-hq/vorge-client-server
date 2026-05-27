const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const db = require("../../db/knex");
const authenticate = require("../../middleware/authenticate");
const { appendAuditLog } = require("../../repositories/auditRepository");
const sessionService = require("../../services/sessionService");
const refreshTokenService = require("../../services/refreshTokenService");
const refreshTokenRepository = require("../../repositories/refreshTokenRepository");
const sessionRepository = require("../../repositories/sessionRepository");
const passwordResetService = require("../../services/passwordResetService");
const emailService = require("../../services/emailService");
const {
  findUserByEmail,
  findUserById,
  firstRoleAssignment,
  hasAssignedRole,
  publicUser
} = require("../../repositories/userRepository");

const router = express.Router();

const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

function setRefreshCookie(res, plaintextToken, expiresAt) {
  const maxAgeMs = expiresAt
    ? Math.max(0, expiresAt.getTime() - Date.now())
    : REFRESH_COOKIE_MAX_AGE_MS;
  res.cookie(env.refreshCookieName, plaintextToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: env.refreshCookiePath,
    maxAge: maxAgeMs,
    domain: env.cookieDomain
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: env.refreshCookiePath,
    domain: env.cookieDomain
  });
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

async function auditAuthEvent({ user, actionType, actingRole, req, metadata = {} }, trx) {
  const assignment = firstRoleAssignment(user);

  if (!assignment?.facilityId) {
    return null;
  }

  return appendAuditLog(
    {
      actionType,
      userId: user.id,
      actingRole: actingRole || assignment.role,
      facilityId: assignment.facilityId,
      entityType: "session",
      entityId: user.id,
      metadata: {
        sourceIp: req.ip,
        ...metadata
      },
      traceId: req.traceId
    },
    trx
  );
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

    const { sid, plaintextToken, refreshExpiresAt, familyId } = await db.transaction(async (trx) => {
      const { sid: newSid } = await sessionService.issueSession({ user, actingRole, req }, trx);
      const { plaintextToken: refreshToken, expiresAt, familyId: family } =
        await refreshTokenService.issueInitial({ user, sessionId: newSid }, trx);
      await auditAuthEvent(
        { user, actionType: "auth.login", actingRole, req, metadata: { sid: newSid, familyId: family } },
        trx
      );
      return { sid: newSid, plaintextToken: refreshToken, refreshExpiresAt: expiresAt, familyId: family };
    });

    setRefreshCookie(res, plaintextToken, refreshExpiresAt);

    return res.json(
      serializeSession({
        user,
        actingRole,
        token: signSessionToken({ user, actingRole, sid })
      })
    );
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

  const presentedRefresh = req.cookies[env.refreshCookieName];

  if (!presentedRefresh) {
    return res
      .status(401)
      .json({ error: { code: "MISSING_REFRESH_TOKEN", message: "Refresh token missing" } });
  }

  try {
    const result = await db.transaction(async (trx) => {
      const rotation = await refreshTokenService.rotate(
        { presentedPlaintext: presentedRefresh, user: req.user, actingRole: role, req },
        trx
      );

      const targetAssignment =
        req.user.roleAssignments.find((assignment) => assignment.role === role) ||
        firstRoleAssignment(req.user);

      if (targetAssignment?.facilityId) {
        await appendAuditLog(
          {
            actionType: "auth.role_switched",
            userId: req.user.id,
            actingRole: role,
            facilityId: targetAssignment.facilityId,
            entityType: "session",
            entityId: req.user.id,
            metadata: {
              previousRole: req.actingRole,
              nextRole: role,
              previousSid: rotation.previousSid,
              nextSid: rotation.sessionId,
              familyId: rotation.familyId,
              refreshTokenRotated: !rotation.wasReuseWindow,
              sourceIp: req.ip
            },
            traceId: req.traceId
          },
          trx
        );
      }

      return rotation;
    });

    if (!result.wasReuseWindow && result.plaintextToken) {
      setRefreshCookie(res, result.plaintextToken, result.expiresAt);
    }

    return res.json(
      serializeSession({
        user: req.user,
        actingRole: role,
        token: signSessionToken({ user: req.user, actingRole: role, sid: result.sessionId })
      })
    );
  } catch (error) {
    if (error.code === "INVALID_REFRESH_TOKEN") {
      clearRefreshCookie(res);
      return res
        .status(401)
        .json({ error: { code: "INVALID_REFRESH_TOKEN", message: error.message } });
    }
    return next(error);
  }
});

router.post("/logout", authenticate, async (req, res, next) => {
  const presentedRefresh = req.cookies[env.refreshCookieName];

  try {
    const { familyId } = await db.transaction(async (trx) => {
      await sessionService.revokeSession(req.tokenSid, new Date(), trx);
      const revokeResult = presentedRefresh
        ? await refreshTokenService.revokeFamilyByToken(presentedRefresh, new Date(), trx)
        : { revokedCount: 0, familyId: null };
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.logout",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid, familyId: revokeResult.familyId }
        },
        trx
      );
      return revokeResult;
    });

    clearRefreshCookie(res);
    res.set("X-Refresh-Family", familyId || ""); // for tests/debug only; harmless to clients
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  const presentedRefresh = req.cookies[env.refreshCookieName];

  if (!presentedRefresh) {
    return res
      .status(401)
      .json({ error: { code: "MISSING_REFRESH_TOKEN", message: "Refresh token missing" } });
  }

  let preLookupUser = null;
  let preLookupActingRole = null;

  try {
    const tokenHash = refreshTokenService.hashToken(presentedRefresh);
    const refreshRow = await refreshTokenRepository.findByHash(tokenHash);
    if (!refreshRow) {
      return res
        .status(401)
        .json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token invalid or expired" } });
    }

    const sessionRow = await sessionRepository.findSessionById(refreshRow.sessionId);
    if (!sessionRow) {
      return res
        .status(401)
        .json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token invalid or expired" } });
    }

    const user = await findUserById(refreshRow.userId);
    if (!user) {
      return res
        .status(401)
        .json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token invalid or expired" } });
    }

    preLookupUser = user;
    preLookupActingRole = sessionRow.actingRole;

    const result = await db.transaction(async (trx) => {
      const rotation = await refreshTokenService.rotate(
        { presentedPlaintext: presentedRefresh, user, actingRole: preLookupActingRole, req },
        trx
      );

      await auditAuthEvent(
        {
          user,
          actionType: "auth.refresh",
          actingRole: preLookupActingRole,
          req,
          metadata: {
            sid: rotation.sessionId,
            familyId: rotation.familyId,
            wasReuseWindow: rotation.wasReuseWindow
          }
        },
        trx
      );

      return rotation;
    });

    if (!result.wasReuseWindow && result.plaintextToken) {
      setRefreshCookie(res, result.plaintextToken, result.expiresAt);
    }

    const newAccessToken = signSessionToken({
      user,
      actingRole: preLookupActingRole,
      sid: result.sessionId
    });

    return res.json(
      serializeSession({
        user,
        actingRole: preLookupActingRole,
        token: newAccessToken
      })
    );
  } catch (error) {
    if (error.code === "INVALID_REFRESH_TOKEN") {
      clearRefreshCookie(res);
      if (error.replayDetected && preLookupUser) {
        // Family is already revoked by the service; audit the detection.
        // Fire-and-forget audit; failures here shouldn't mask the 401.
        auditAuthEvent({
          user: preLookupUser,
          actionType: "auth.refresh_replay_detected",
          actingRole: preLookupActingRole || "Unauthenticated",
          req,
          metadata: { reason: "refresh-token replay" }
        }).catch(() => {});
      }
      return res
        .status(401)
        .json({ error: { code: "INVALID_REFRESH_TOKEN", message: error.message } });
    }
    return next(error);
  }
});

// TODO: rate-limit POST /forgot-password (see chunk 3 plan §Out of scope).
router.post("/forgot-password", async (req, res, next) => {
  const { email } = req.body || {};

  try {
    await db.transaction(async (trx) => {
      const result = await passwordResetService.requestReset({ email, req }, trx);
      if (result) {
        emailService.sendPasswordResetEmail(email, result.resetUrl);
        await auditAuthEvent(
          {
            user: result.user,
            actionType: "auth.password_reset_requested",
            actingRole: firstRoleAssignment(result.user)?.role || "Unauthenticated",
            req,
            metadata: { tokenId: result.tokenId }
          },
          trx
        );
      }
    });

    // Always 200 — enumeration protection.
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  const { token, password } = req.body || {};

  try {
    const user = await db.transaction(async (trx) => {
      const updatedUser = await passwordResetService.consumeToken(
        { plaintextToken: token, newPassword: password },
        trx
      );
      await passwordResetService.invalidateAllUserSessions({ userId: updatedUser.id }, trx);
      await auditAuthEvent(
        {
          user: updatedUser,
          actionType: "auth.password_reset_completed",
          actingRole: firstRoleAssignment(updatedUser)?.role || "Unauthenticated",
          req
        },
        trx
      );
      return updatedUser;
    });

    return res.json({ ok: true, userId: user.id });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
