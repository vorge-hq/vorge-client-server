const app = require("./app");
const env = require("./config/env");
const db = require("./db/knex");

// RLS is defense-in-depth: it only bites when the app connects as a NON-owner
// role (Postgres table owners and BYPASSRLS roles skip every policy). If a
// misconfigured DATABASE_URL points at the owner, tenant isolation silently
// falls back to app-layer guards alone — with no other signal. Assert the
// connection role at boot: refuse to start in production, warn elsewhere.
async function assertRlsRole() {
  try {
    const { rows } = await db.raw(
      "SELECT current_user AS role, " +
        "(SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls"
    );
    const { role, bypass_rls: bypassRls } = rows[0] || {};
    if (bypassRls) {
      const message =
        `DB connection role "${role}" bypasses row-level security (BYPASSRLS or table owner). ` +
        "RLS tenant isolation is INERT for this connection.";
      if (env.nodeEnv === "production") {
        throw new Error(
          message + " Point DATABASE_URL at the non-owner application role (vorge_app)."
        );
      }
      console.warn(`[rls-guard] WARNING: ${message} (allowed outside production)`);
    }
  } catch (error) {
    if (env.nodeEnv === "production") throw error;
    console.warn(`[rls-guard] Could not verify DB role: ${error.message}`);
  }
}

async function start() {
  await assertRlsRole();
  app.listen(env.port, () => {
    console.log(`Vorge server listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
