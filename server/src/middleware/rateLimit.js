const rateLimit = require("express-rate-limit");
const env = require("../config/env");

// In test mode, raise the limits to a level that won't interfere with the
// integration suite (single shared IP across all tests). The middleware is
// still wired in so route ordering / config is exercised.
const isTest = env.nodeEnv === "test";
const PER_USER_MAX = isTest ? 10000 : 10;
const PER_IP_MAX = isTest ? 10000 : 100;

/**
 * Per-user rate limit for MFA endpoints: 10 requests per 60s.
 * Per docs/decisions/chunk-4-mfa.md §Bake-ins. In-memory store; multi-instance
 * deployment requires Redis migration (tracked in lockbox).
 */
const mfaUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: PER_USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => req.user?.id || req.body?.email || req.ip || "anonymous",
  handler: (req, res) =>
    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many MFA requests; please slow down"
      }
    })
});

/**
 * Per-IP rate limit for MFA endpoints: 100 requests per 60s.
 * Defense-in-depth against credential-stuffing / botnet patterns. Wider than
 * the per-user limit because legitimate shared NATs may aggregate users.
 */
const mfaIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: PER_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => req.ip || "anonymous",
  handler: (req, res) =>
    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many MFA requests from this network"
      }
    })
});

const mfaRateLimit = [mfaIpLimiter, mfaUserLimiter];

// ─── Unauthenticated auth-endpoint limiters ──────────────────────────────────
// login / refresh / forgot-password / reset-password have no user attached yet,
// so they cannot use the per-user MFA limiter. These throttle online password
// brute-force, credential stuffing, refresh-token guessing and reset-email
// flooding. In-memory store (single-instance deploy); Redis migration tracked
// with the MFA caches for multi-instance (docs/roadmap.md P5).
const AUTH_PER_IP_MAX = isTest ? 100000 : 60;
const AUTH_PER_IP_EMAIL_MAX = isTest ? 100000 : 10;

function authRateLimiter({ max, keyGenerator, message }) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator,
    handler: (req, res) =>
      res.status(429).json({
        error: { code: "RATE_LIMIT_EXCEEDED", message }
      })
  });
}

const byIp = (req) => req.ip || "anonymous";
const byIpEmail = (req) =>
  `${req.ip || "anonymous"}:${String(req.body?.email || "").trim().toLowerCase()}`;

// Login: throttle per network AND per (network, email) so a single account
// can't be hammered and a single IP can't spray many accounts.
const loginRateLimit = [
  authRateLimiter({
    max: AUTH_PER_IP_MAX,
    keyGenerator: byIp,
    message: "Too many login attempts from this network; please slow down"
  }),
  authRateLimiter({
    max: AUTH_PER_IP_EMAIL_MAX,
    keyGenerator: byIpEmail,
    message: "Too many login attempts for this account; please slow down"
  })
];

// Password-reset request/consume: same shape (email drives both the reset-email
// flood vector and the token-guessing vector).
const passwordResetRateLimit = [
  authRateLimiter({
    max: AUTH_PER_IP_MAX,
    keyGenerator: byIp,
    message: "Too many password-reset requests from this network; please slow down"
  }),
  authRateLimiter({
    max: AUTH_PER_IP_EMAIL_MAX,
    keyGenerator: byIpEmail,
    message: "Too many password-reset requests for this account; please slow down"
  })
];

// Refresh: no email in the body, so per-IP only.
const refreshRateLimit = [
  authRateLimiter({
    max: AUTH_PER_IP_MAX,
    keyGenerator: byIp,
    message: "Too many token-refresh requests from this network; please slow down"
  })
];

module.exports = {
  mfaUserLimiter,
  mfaIpLimiter,
  mfaRateLimit,
  loginRateLimit,
  passwordResetRateLimit,
  refreshRateLimit
};
