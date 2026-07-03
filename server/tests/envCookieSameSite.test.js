// Boot-guard tests for COOKIE_SAME_SITE / DATABASE_SSL added in P0
// (cross-site Vercel client ↔ Render API deployment).

const ENV_KEYS = ["COOKIE_SAME_SITE", "COOKIE_SECURE", "DATABASE_SSL"];
const saved = {};

function loadEnv() {
  let env;
  jest.isolateModules(() => {
    env = require("../src/config/env");
  });
  return env;
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe("env.cookieSameSite", () => {
  test("defaults to strict", () => {
    expect(loadEnv().cookieSameSite).toBe("strict");
  });

  test("accepts lax", () => {
    process.env.COOKIE_SAME_SITE = "lax";
    expect(loadEnv().cookieSameSite).toBe("lax");
  });

  test("normalizes case", () => {
    process.env.COOKIE_SAME_SITE = "Strict";
    expect(loadEnv().cookieSameSite).toBe("strict");
  });

  test("accepts none when cookies are Secure", () => {
    process.env.COOKIE_SAME_SITE = "none";
    process.env.COOKIE_SECURE = "true";
    expect(loadEnv().cookieSameSite).toBe("none");
  });

  test("rejects none without Secure (browsers drop such cookies)", () => {
    process.env.COOKIE_SAME_SITE = "none";
    process.env.COOKIE_SECURE = "false";
    expect(loadEnv).toThrow(/COOKIE_SAME_SITE=none requires Secure/);
  });

  test("rejects unknown values", () => {
    process.env.COOKIE_SAME_SITE = "sideways";
    expect(loadEnv).toThrow(/strict\|lax\|none/);
  });
});

describe("env.databaseSsl", () => {
  test("defaults off outside production", () => {
    expect(loadEnv().databaseSsl).toBe(false);
  });

  test("explicit DATABASE_SSL=true turns it on", () => {
    process.env.DATABASE_SSL = "true";
    expect(loadEnv().databaseSsl).toBe(true);
  });

  test("explicit DATABASE_SSL=false turns it off", () => {
    process.env.DATABASE_SSL = "false";
    expect(loadEnv().databaseSsl).toBe(false);
  });
});
