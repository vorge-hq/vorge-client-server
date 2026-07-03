// P2 · Deliverable 4 — Row-Level Security policies (defense-in-depth).
//
// RLS was ENABLEd on the assessment-scoped tables in the initial migration but
// carried ZERO policies (so a non-owner role saw nothing; the owner bypassed
// it entirely). This migration installs a uniform tenant-isolation policy on
// every facility-scoped DATA table:
//
//   a row is visible/writable  <=>  its facility_id is in the per-transaction
//   context set app.current_facility_ids.
//
// The app resolves the acting role into a concrete list of facility ids (the
// same set facilityScopeFor already computes) and, per request, runs
//   SELECT set_config('app.current_facility_ids', '<uuid,uuid,...>', true)
// inside a transaction. With no context set the predicate is NULL → default
// DENY (zero rows), never all rows.
//
// Design constraints (see docs/decisions + docs/roadmap.md P2):
//   - The app MUST connect as a NON-OWNER role. Table owners bypass RLS unless
//     FORCE ROW LEVEL SECURITY — and we deliberately do NOT force it, because
//     migrations and seeding run as the owner and insert rows with no context.
//   - Auth/lookup tables (users, role_assignments, operators, facilities) get
//     NO policy: `authenticate` must load the user + role assignments BEFORE any
//     facility context exists. Their scoping stays app-layer.
//   - `set_config(..., true)` is transaction-local, so it is safe under
//     Supabase transaction pooling (context cannot leak to the next txn on a
//     reused connection). Proven by tests/integration/rls.test.js.

// Every facility-scoped data table. All carry a NOT NULL facility_id.
const RLS_TABLES = [
  "assessments",
  "assets",
  "threats",
  "asset_threat_links",
  "evaluations",
  "mitigations",
  "audit_log_entries",
  "mitigation_progress_logs",
  "versions",
  "library_entries"
];

// The initial migration only ENABLEd RLS on these; the rest need enabling here.
const NEEDS_ENABLE = ["mitigation_progress_logs", "versions", "library_entries"];

const POLICY = "facility_isolation";

// A row's facility_id must be one of the ids in the per-txn context. NULLIF maps
// an unset/empty context to NULL → `= ANY(NULL)` is NULL → row denied.
const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  for (const table of NEEDS_ENABLE) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  }

  for (const table of RLS_TABLES) {
    // DROP-then-CREATE keeps the migration re-runnable (idempotent) without
    // relying on CREATE POLICY IF NOT EXISTS (unsupported before PG 15).
    await knex.raw(`DROP POLICY IF EXISTS ${POLICY} ON ${table}`);
    await knex.raw(`
      CREATE POLICY ${POLICY} ON ${table}
        USING (${PREDICATE})
        WITH CHECK (${PREDICATE})
    `);
  }
};

exports.down = async function down(knex) {
  for (const table of RLS_TABLES) {
    await knex.raw(`DROP POLICY IF EXISTS ${POLICY} ON ${table}`);
  }
  // Only disable RLS on the tables THIS migration enabled it for; leave the
  // originally-enabled tables as the initial migration left them.
  for (const table of NEEDS_ENABLE) {
    await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
};
