const knex = require("knex");
const env = require("../config/env");

const db = knex({
  client: "pg",
  connection: {
    connectionString: env.databaseUrl,
    // Supabase requires TLS; cert chain is not CA-verifiable without a bundle
    // (CA pinning deferred to P5 hardening). Off by default outside production.
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false
  }
});

module.exports = db;
