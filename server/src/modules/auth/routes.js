const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const db = require("../../db/knex");
const authenticate = require("../../middleware/authenticate");
const authorizeRole = require("../../middleware/authorizeRole");
const { rejectGuest } = require("../../middleware/rejectGuest");
const { ROLES } = require("../../services/constants");
const {
  mfaRateLimit,
  loginRateLimit,
  passwordResetRateLimit,
  refreshRateLimit
} = require("../../middleware/rateLimit");
const { appendAuditLog } = require("../../repositories/auditRepository");
const sessionService = require("../../services/sessionService");
const refreshTokenService = require("../../services/refreshTokenService");
const refreshTokenRepository = require("../../repositories/refreshTokenRepository");
const sessionRepository = require("../../repositories/sessionRepository");
const passwordResetService = require("../../services/passwordResetService");
const emailService = require("../../services/emailService");
const mfaPolicy = require("../../services/mfaPolicy");
const mfaService = require("../../services/mfaService");
const trustDeviceService = require("../../services/mfaTrustDeviceService");
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
    sameSite: env.cookieSameSite,
    path: env.refreshCookiePath,
    maxAge: maxAgeMs,
    domain: env.cookieDomain
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: env.refreshCookiePath,
    domain: env.cookieDomain
  });
}

function serializeSession({ user, actingRole, token, extra = {} }) {
  return {
    token,
    user: publicUser(user),
    actingRole,
    roles: user.roles,
    facilities: user.facilities,
    mfaSatisfied: extra.mfaSatisfied !== undefined ? extra.mfaSatisfied : true,
    mustReenroll: extra.mustReenroll === true,
    ...extra
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

// ─── LOGIN ─────────────────────────────────────────────────────────────────

router.post("/login", ...loginRateLimit, async (req, res, next) => {
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
          req
        });
      }
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    }

    const actingRole = firstRoleAssignment(user)?.role;
    if (!actingRole) {
      return res.status(403).json({ error: { code: "NO_ROLE_ASSIGNED", message: "User has no assigned roles" } });
    }

    // Determine MFA enforcement state for this user.
    const mfaGated = env.mfaEnforcementEnabled && mfaPolicy.requiresMfa(user);
    let trustedDevice = false;
    if (mfaGated && user.mfaEnrolledAt) {
      try {
        trustedDevice = await trustDeviceService.validateCookie(req, user.id);
      } catch (_e) {
        trustedDevice = false;
      }
    }
    const enrollmentNeeded = mfaGated && !user.mfaEnrolledAt;
    const mfaSatisfied = !mfaGated || trustedDevice;
    const mfaRequired = mfaGated && !mfaSatisfied;

    const { sid, plaintextToken, refreshExpiresAt, familyId } = await db.transaction(async (trx) => {
      const { sid: newSid } = await sessionService.issueSession(
        { user, actingRole, req, mfaSatisfied, mustReenroll: false },
        trx
      );
      const { plaintextToken: refreshToken, expiresAt, familyId: family } =
        await refreshTokenService.issueInitial({ user, sessionId: newSid }, trx);
      await auditAuthEvent(
        {
          user,
          actionType: "auth.login",
          actingRole,
          req,
          metadata: {
            sid: newSid,
            familyId: family,
            mfaRequired,
            enrollmentNeeded,
            trustedDevice
          }
        },
        trx
      );
      if (mfaGated && trustedDevice) {
        await auditAuthEvent(
          {
            user,
            actionType: "auth.mfa_verified",
            actingRole,
            req,
            metadata: { sid: newSid, outcome: "trusted_device" }
          },
          trx
        );
      }
      if (mfaGated && !env.mfaEnforcementEnabled) {
        // Rollback flag is OFF but we don't take this path; defensive note.
      }
      return { sid: newSid, plaintextToken: refreshToken, refreshExpiresAt: expiresAt, familyId: family };
    });

    if (mfaGated && !env.mfaEnforcementEnabled) {
      // unreachable; guard if the flag toggles mid-flight
    }

    setRefreshCookie(res, plaintextToken, refreshExpiresAt);

    return res.json(
      serializeSession({
        user,
        actingRole,
        token: signSessionToken({ user, actingRole, sid }),
        extra: { mfaSatisfied, mfaRequired, enrollmentNeeded }
      })
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, (req, res) => {
  res.json(
    serializeSession({
      user: req.user,
      actingRole: req.actingRole,
      token: null,
      extra: {
        mfaSatisfied: req.session?.mfaSatisfied !== false,
        mustReenroll: req.session?.mustReenroll === true
      }
    })
  );
});

// ─── SWITCH ROLE ──────────────────────────────────────────────────────────

router.post("/switch-role", authenticate, async (req, res, next) => {
  const { role } = req.body;

  if (!hasAssignedRole(req.user, role)) {
    return res.status(403).json({ error: { code: "ROLE_NOT_ASSIGNED", message: "User is not assigned to that role" } });
  }

  // If target role is MFA-required and the user has not enrolled, block.
  // Per lockbox §I-1 lenient reading of decision #7, an already-mfa_satisfied
  // session can switch into MFA-required roles without re-verify.
  if (
    env.mfaEnforcementEnabled &&
    mfaPolicy.roleRequiresMfa(role) &&
    !req.user.mfaEnrolledAt
  ) {
    return res.status(403).json({
      error: {
        code: "MFA_ENROLLMENT_REQUIRED",
        message: "Enroll in MFA before switching to this role"
      }
    });
  }

  const presentedRefresh =
    req.cookies[env.refreshCookieName] || req.cookies[env.legacyRefreshCookieName];

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
        token: signSessionToken({ user: req.user, actingRole: role, sid: result.sessionId }),
        extra: {
          mfaSatisfied: req.session?.mfaSatisfied !== false,
          mustReenroll: req.session?.mustReenroll === true
        }
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

// ─── LOGOUT ───────────────────────────────────────────────────────────────

router.post("/logout", authenticate, async (req, res, next) => {
  const presentedRefresh =
    req.cookies[env.refreshCookieName] || req.cookies[env.legacyRefreshCookieName];

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
    trustDeviceService.clearCookie(res);
    res.set("X-Refresh-Family", familyId || "");
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

// ─── REFRESH ──────────────────────────────────────────────────────────────

router.post("/refresh", ...refreshRateLimit, async (req, res, next) => {
  const presentedRefresh =
    req.cookies[env.refreshCookieName] || req.cookies[env.legacyRefreshCookieName];

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
        token: newAccessToken,
        extra: {
          mfaSatisfied: sessionRow.mfaSatisfied !== false,
          mustReenroll: sessionRow.mustReenroll === true
        }
      })
    );
  } catch (error) {
    if (error.code === "INVALID_REFRESH_TOKEN") {
      clearRefreshCookie(res);
      if (error.replayDetected && preLookupUser) {
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

// ─── PASSWORD RESET ───────────────────────────────────────────────────────

router.post("/forgot-password", ...passwordResetRateLimit, async (req, res, next) => {
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
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", ...passwordResetRateLimit, async (req, res, next) => {
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

// ─── MFA SUB-ROUTER ───────────────────────────────────────────────────────

const mfaRouter = express.Router();

// All MFA endpoints are rate-limited per the locked bake-in (10/min/user,
// 100/min/IP). The user limiter falls back to IP when no user is attached.
mfaRouter.use(...mfaRateLimit);

// Guest side-quest · G3 — a shared read-only guest must never enroll MFA on the
// shared account (it would lock out every other guest). rejectGuest runs after
// authenticate (which sets req.actingRole) so a Guest gets 403 before any TOTP
// secret is minted. mfa/verify, disable, regen are inert on a never-enrolled
// account and need no guard.
mfaRouter.post("/enroll-start", authenticate, rejectGuest, async (req, res, next) => {
  try {
    const out = await db.transaction((trx) => mfaService.enrollStart({ user: req.user }, trx));
    return res.json(out);
  } catch (error) {
    return next(error);
  }
});

mfaRouter.post("/enroll-verify", authenticate, rejectGuest, async (req, res, next) => {
  const { code } = req.body || {};
  try {
    const result = await db.transaction(async (trx) => {
      const out = await mfaService.enrollVerify({ user: req.user, code }, trx);
      // Promote session to mfa_satisfied so the user can proceed past the gate.
      await sessionRepository.setMfaSatisfied(req.tokenSid, true, trx);
      // Clear must_reenroll if it was set (recovery-code re-enrollment path).
      await sessionRepository.setMustReenroll(req.tokenSid, false, trx);
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.mfa_enrolled",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid, outcome: "enrolled" }
        },
        trx
      );
      return out;
    });
    return res.json({ recoveryCodes: result.recoveryCodes });
  } catch (error) {
    return next(error);
  }
});

mfaRouter.post("/verify", authenticate, async (req, res, next) => {
  const { code, trustDevice } = req.body || {};
  try {
    const out = await db.transaction(async (trx) => {
      const result = await mfaService.verifyTotp(
        { user: req.user, sessionId: req.tokenSid, code, trustDevice: Boolean(trustDevice), req, res },
        trx
      );
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.mfa_verified",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid, outcome: "totp", trustDevice: Boolean(trustDevice) }
        },
        trx
      );
      return result;
    });
    return res.json({ ok: true, ...out, mfaSatisfied: true });
  } catch (error) {
    if (error.code === "MFA_LOCKED_OUT") {
      auditAuthEvent({
        user: req.user,
        actionType: "auth.mfa_locked_out",
        actingRole: req.actingRole,
        req,
        metadata: { sid: req.tokenSid, tier: error.tier, remainingMs: error.remainingMs }
      }).catch(() => {});
      return res
        .status(403)
        .json({
          error: {
            code: "MFA_LOCKED_OUT",
            message: error.message,
            details: { remainingMs: error.remainingMs, tier: error.tier }
          }
        });
    }
    if (error.code === "INVALID_TOTP_CODE") {
      auditAuthEvent({
        user: req.user,
        actionType: "auth.mfa_failed",
        actingRole: req.actingRole,
        req,
        metadata: { sid: req.tokenSid, outcome: "invalid_code" }
      }).catch(() => {});
      return res.status(401).json({ error: { code: "INVALID_TOTP_CODE", message: error.message } });
    }
    return next(error);
  }
});

mfaRouter.post("/verify-recovery", authenticate, async (req, res, next) => {
  const { code } = req.body || {};
  try {
    const out = await db.transaction(async (trx) => {
      const result = await mfaService.verifyRecovery(
        { user: req.user, sessionId: req.tokenSid, code },
        trx
      );
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.mfa_recovery_used",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid }
        },
        trx
      );
      return result;
    });
    return res.json({ ok: true, ...out, mfaSatisfied: true, mustReenroll: true });
  } catch (error) {
    if (error.code === "MFA_LOCKED_OUT") {
      return res
        .status(403)
        .json({ error: { code: "MFA_LOCKED_OUT", message: error.message } });
    }
    if (error.code === "INVALID_TOTP_CODE") {
      return res.status(401).json({ error: { code: "INVALID_RECOVERY_CODE", message: "Invalid recovery code" } });
    }
    return next(error);
  }
});

mfaRouter.post("/disable", authenticate, async (req, res, next) => {
  const { password, code } = req.body || {};
  try {
    await db.transaction(async (trx) => {
      await mfaService.disable({ user: req.user, password, code }, trx);
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.mfa_disabled",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid }
        },
        trx
      );
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

mfaRouter.post("/regen-recovery-codes", authenticate, async (req, res, next) => {
  const { code } = req.body || {};
  try {
    const result = await db.transaction(async (trx) => {
      const out = await mfaService.regenerateRecoveryCodes({ user: req.user, code }, trx);
      await auditAuthEvent(
        {
          user: req.user,
          actionType: "auth.mfa_codes_regenerated",
          actingRole: req.actingRole,
          req,
          metadata: { sid: req.tokenSid }
        },
        trx
      );
      return out;
    });
    return res.json({ recoveryCodes: result.recoveryCodes });
  } catch (error) {
    return next(error);
  }
});

mfaRouter.post("/admin-reset", authenticate, authorizeRole(ROLES.ADMIN), async (req, res, next) => {
  const { targetUserId } = req.body || {};
  try {
    const { target } = await db.transaction(async (trx) => {
      const result = await mfaService.adminReset(
        { actor: req.user, targetUserId },
        trx
      );
      // Audit names BOTH actor_user_id and target_user_id per NEW-4.
      const actorAssignment = firstRoleAssignment(req.user);
      if (actorAssignment?.facilityId) {
        await appendAuditLog(
          {
            actionType: "auth.mfa_admin_reset",
            userId: req.user.id,
            actingRole: req.actingRole,
            facilityId: actorAssignment.facilityId,
            entityType: "user",
            entityId: targetUserId,
            metadata: {
              actor_user_id: req.user.id,
              target_user_id: targetUserId,
              sourceIp: req.ip
            },
            traceId: req.traceId
          },
          trx
        );
      }
      return result;
    });
    return res.json({ ok: true, targetUserId: target.id });
  } catch (error) {
    return next(error);
  }
});

router.use("/mfa", mfaRouter);

module.exports = router;
