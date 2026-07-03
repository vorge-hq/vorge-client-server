// Integration tests: real Postgres via TEST_DATABASE_URL (see
// tests/integration/requireTestDb.js). Kept separate from the default unit
// suite so the fast, DB-free `npm test` loop is unaffected.
module.exports = {
  testEnvironment: "node",
  watchman: false,
  testMatch: ["**/tests/integration/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/integration/env-setup.js"],
  globalSetup: "<rootDir>/tests/integration/global-setup.js",
  testTimeout: 30000
};
