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

module.exports = {
  mfaUserLimiter,
  mfaIpLimiter,
  mfaRateLimit
};
