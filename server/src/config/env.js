require("dotenv").config({ path: "../../.env" });

const nodeEnv = process.env.NODE_ENV || "development";

// Dev placeholder: 32 zero bytes, base64-encoded. Production startup throws if
// the placeholder is still in use; tests/dev use it freely.
const DEV_PLACEHOLDER_MFA_KEY = Buffer.alloc(32, 0).toString("base64");

const env = {
  nodeEnv,
  port: Number(process.env.SERVER_PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "replace_me_with_a_strong_secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  passwordResetTokenExpiresIn: process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN || "1h",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/vantage",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : nodeEnv === "production",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // "strict" (default) requires client and API on the same site. Cross-site
  // deployments (Vercel client ↔ Render API) must set COOKIE_SAME_SITE=none,
  // which browsers only accept together with Secure.
  cookieSameSite: (process.env.COOKIE_SAME_SITE || "strict").toLowerCase(),
  // Supabase (and most managed Postgres) require TLS. Defaults on in
  // production, off elsewhere; override with DATABASE_SSL=true/false.
  databaseSsl:
    process.env.DATABASE_SSL !== undefined
      ? process.env.DATABASE_SSL === "true"
      : nodeEnv === "production",
  refreshCookieName: "vorge_refresh",
  // Vantage→Vorge rebrand fallback: accept the legacy cookie on read for
  // one release window so in-flight sessions survive the deploy. Writes
  // and clears always use the new name. Drop after one cycle.
  legacyRefreshCookieName: "vantage_refresh",
  refreshCookiePath: "/api/auth",
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || DEV_PLACEHOLDER_MFA_KEY,
  mfaEnforcementEnabled: process.env.MFA_ENFORCEMENT_ENABLED !== "false",
  mfaTrustCookieName: "vorge_mfa_trust",
  // Same rebrand fallback as refreshCookieName above.
  legacyMfaTrustCookieName: "vantage_mfa_trust",
  mfaTrustCookiePath: "/api/auth",
  mfaTrustCookieMaxAgeMs: 30 * 24 * 60 * 60 * 1000
};

// ── Boot guards ─────────────────────────────────────────────────────────────

// MFA_ENCRYPTION_KEY must decode to exactly 32 bytes and round-trip cleanly.
// This guard runs in every environment (dev, test, prod) so wrong-length /
// invalid-base64 keys never slip through.
(function assertMfaEncryptionKey(value) {
  let buf;
  try {
    buf = Buffer.from(value, "base64");
  } catch (_e) {
    throw new Error("MFA_ENCRYPTION_KEY is not valid base64");
  }
  if (buf.length !== 32) {
    throw new Error(
      `MFA_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  if (buf.toString("base64") !== value) {
    throw new Error("MFA_ENCRYPTION_KEY is not valid base64 (round-trip check failed)");
  }
})(env.mfaEncryptionKey);

// COOKIE_SAME_SITE must be a value browsers accept, and SameSite=None is only
// honored on Secure cookies — reject the combination that would silently drop
// every refresh/MFA-trust cookie.
(function assertCookieSameSite(value) {
  if (!["strict", "lax", "none"].includes(value)) {
    throw new Error(
      `COOKIE_SAME_SITE must be one of strict|lax|none (got "${value}")`
    );
  }
  if (value === "none" && !env.cookieSecure) {
    throw new Error(
      "COOKIE_SAME_SITE=none requires Secure cookies (set COOKIE_SECURE=true or run with NODE_ENV=production)"
    );
  }
})(env.cookieSameSite);

if (env.nodeEnv === "production") {
  if (env.jwtSecret === "replace_me_with_a_strong_secret") {
    throw new Error("JWT_SECRET must be changed for production");
  }
  if (env.mfaEncryptionKey === DEV_PLACEHOLDER_MFA_KEY) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be changed for production. Generate with: openssl rand -base64 32"
    );
  }
  if (process.env.__MFA_TEST_MODE__ === "1") {
    throw new Error("__MFA_TEST_MODE__ MUST NOT be set in production");
  }
}

module.exports = env;
