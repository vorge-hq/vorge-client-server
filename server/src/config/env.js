require("dotenv").config({ path: "../../.env" });

const nodeEnv = process.env.NODE_ENV || "development";

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
  refreshCookieName: "vantage_refresh",
  refreshCookiePath: "/api/auth"
};

if (env.nodeEnv === "production" && env.jwtSecret === "replace_me_with_a_strong_secret") {
  throw new Error("JWT_SECRET must be changed for production");
}

module.exports = env;
