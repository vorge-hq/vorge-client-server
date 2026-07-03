// Runs (per worker) BEFORE any app module is required, so src/db/knex.js and
// src/config/env.js see the right connection. Maps the throwaway
// TEST_DATABASE_URL onto DATABASE_URL and forces local (no SSL) test mode.
const { requireTestDbUrl } = require("./requireTestDb");

const url = requireTestDbUrl();
process.env.DATABASE_URL = url;
process.env.DATABASE_SSL = "false";
process.env.NODE_ENV = "test";
