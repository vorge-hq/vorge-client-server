const path = require("path");
const knexLib = require("knex");
const { requireTestDbUrl } = require("./requireTestDb");

// The non-owner application role used by the RLS tests (rls.test.js). It is a
// LOGIN role that is NOT the table owner and does NOT have BYPASSRLS, so the
// policies installed by 202607030002_rls_policies.js actually apply to it —
// exactly the posture the real app role must have on Supabase (the dashboard
// step handed to the user creates the equivalent role there).
const APP_ROLE = "vorge_app_rls";
const APP_PASSWORD = "vorge_app_rls";

// Idempotently create the role + grants. Runs as the migration/owner role.
async function provisionAppRole(knex) {
  await knex.raw(
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
         CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}';
       END IF;
     END
     $$;`
  );
  // Re-granting is harmless, so this is safe to repeat every run. The role gets
  // the same DML surface the real app role needs; RLS — not GRANTs — is what
  // enforces tenant isolation.
  await knex.raw(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await knex.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
}

// Runs once before the integration suite: bring the test DB schema to latest
// and provision the non-owner RLS role. Both are idempotent, so re-running
// across sessions is safe.
module.exports = async () => {
  const url = requireTestDbUrl();
  const knex = knexLib({
    client: "pg",
    connection: { connectionString: url, ssl: false },
    migrations: { directory: path.join(__dirname, "../../migrations") }
  });
  try {
    await knex.migrate.latest();
    await provisionAppRole(knex);
  } finally {
    await knex.destroy();
  }
};

module.exports.APP_ROLE = APP_ROLE;
module.exports.APP_PASSWORD = APP_PASSWORD;
