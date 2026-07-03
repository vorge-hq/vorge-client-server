require("dotenv").config({ path: "../.env" });

const connection =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/vantage";

// Migrations want a plain, long-lived session. Against Supabase that means
// the DIRECT (or session-pooler) connection string — the transaction pooler
// the app uses at runtime is unsuitable for migration locks. This knexfile is
// only consumed by the knex CLI (migrations); the app builds its own
// connection in src/db/knex.js from DATABASE_URL.
const migrationConnection = process.env.MIGRATE_DATABASE_URL || connection;

// Managed Postgres (Supabase) requires TLS but presents a cert chain node-pg
// cannot verify without a CA bundle; CA pinning is deferred to P5 hardening.
const sslConfig =
  process.env.DATABASE_SSL === "true" || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false;

module.exports = {
  development: {
    client: "pg",
    connection: {
      connectionString: migrationConnection,
      ssl: sslConfig
    },
    migrations: {
      directory: "./migrations"
    }
  },
  test: {
    client: "pg",
    connection: process.env.TEST_DATABASE_URL || connection,
    migrations: {
      directory: "./migrations"
    }
  },
  production: {
    client: "pg",
    connection: {
      connectionString: migrationConnection,
      ssl: sslConfig
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: "./migrations"
    }
  }
};
