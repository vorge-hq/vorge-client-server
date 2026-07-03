// P2 · Deliverable 4 — Row-Level Security, proven as the NON-OWNER app role.
//
// This is the defense-in-depth layer beneath the repo-scoping and route guards:
// even a query with NO WHERE clause, issued by the app's DB role, must see only
// the rows for the facility context set on the current transaction. The owner
// role (postgres) bypasses RLS, so these tests connect as `vorge_app_rls` — the
// non-owner LOGIN role provisioned in global-setup.js — which is the local
// stand-in for the Supabase app role the user wires via the dashboard.
//
// Matrix (docs/test-specs.md §P2 deliverable 4):
//   - context set  -> SELECT * (no WHERE) returns ONLY the context facility's rows.
//   - no context   -> zero rows (default-deny), not all rows.
//   - cross-tenant UPDATE by id -> 0 rows affected, target row unchanged.
//   - pooling      -> two sequential txns with different SET LOCAL contexts on the
//                     SAME connection do not leak (max:1 pool forces one connection).
const knexLib = require("knex");
const db = require("../../src/db/knex"); // owner connection — seeds past RLS.
const { requireTestDbUrl } = require("./requireTestDb");
const { APP_ROLE, APP_PASSWORD } = require("./global-setup");
const { id, OPERATORS, FACILITIES, USERS, ASSESSMENTS, truncateAll, seedFixtures } = require("./fixtures");

// Build a connection string for the non-owner role by swapping credentials on
// the test DB URL (same host/db, different login).
function appRoleConnectionString() {
  const url = new URL(requireTestDbUrl());
  url.username = APP_ROLE;
  url.password = APP_PASSWORD;
  return url.toString();
}

// pool max:1 so every query in this suite runs on the SAME physical connection —
// which is exactly what lets the pooling-leak test be meaningful.
let appDb;

// Run `fn(trx)` inside a transaction whose facility context is the given ids.
// set_config(..., true) is transaction-local (the pooling-safe form).
function withFacilityContext(facilityIds, fn) {
  return appDb.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.current_facility_ids', ?, true)", [facilityIds.join(",")]);
    return fn(trx);
  });
}

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  appDb = knexLib({
    client: "pg",
    connection: { connectionString: appRoleConnectionString(), ssl: false },
    pool: { min: 1, max: 1 }
  });
});

afterAll(async () => {
  await appDb.destroy();
  await db.destroy();
});

describe("RLS as the non-owner app role", () => {
  test("context = Facility A1 → SELECT * FROM assessments returns only A1's row", async () => {
    const rows = await withFacilityContext([FACILITIES.A1.id], (trx) =>
      trx("assessments").select("id", "facility_id")
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ASSESSMENTS.A1.id);
    expect(rows[0].facility_id).toBe(FACILITIES.A1.id);
  });

  test("context = multiple facilities (A1, A2) → sees both, zero Op-B rows", async () => {
    const rows = await withFacilityContext([FACILITIES.A1.id, FACILITIES.A2.id], (trx) =>
      trx("assessments").select("id")
    );
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([ASSESSMENTS.A1.id, ASSESSMENTS.A2.id].sort());
    expect(ids).not.toContain(ASSESSMENTS.B1.id);
    expect(ids).not.toContain(ASSESSMENTS.B2.id);
  });

  test("child tables are scoped identically (mitigations under context A1)", async () => {
    const rows = await withFacilityContext([FACILITIES.A1.id], (trx) =>
      trx("mitigations").select("id", "facility_id")
    );
    expect(rows.every((r) => r.facility_id === FACILITIES.A1.id)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("no context set → zero rows (default-deny), not all rows", async () => {
    // A plain query outside any set_config transaction: the GUC is unset.
    const rows = await appDb("assessments").select("id");
    expect(rows).toEqual([]);
  });

  test("cross-tenant UPDATE by id → 0 rows affected, target row unchanged", async () => {
    const affected = await withFacilityContext([FACILITIES.A1.id], async (trx) => {
      const res = await trx("assessments").where({ id: ASSESSMENTS.B1.id }).update({ name: "hacked" });
      return res; // knex returns the affected row count for pg updates
    });
    expect(affected).toBe(0);

    // Verify via the owner connection (which bypasses RLS) that B1 is intact.
    const b1 = await db("assessments").where({ id: ASSESSMENTS.B1.id }).first("name");
    expect(b1.name).toBe(ASSESSMENTS.B1.name);
  });

  test("cross-tenant INSERT (WITH CHECK) into another facility → rejected by RLS", async () => {
    // Every column is otherwise valid (real operator/facility/author FKs) so the
    // ONLY reason this fails is the WITH CHECK policy — asserted via the error.
    await expect(
      withFacilityContext([FACILITIES.A1.id], (trx) =>
        trx("assessments").insert({
          id: id(990001),
          operator_id: OPERATORS.B.id,
          facility_id: FACILITIES.B1.id,
          lead_author_user_id: USERS.authorB1.id,
          name: "smuggled",
          state: "Draft",
          lock_version: 1,
          contributors: JSON.stringify([])
        })
      )
    ).rejects.toThrow(/row-level security/i);

    // And nothing was written (owner connection bypasses RLS to check).
    const smuggled = await db("assessments").where({ id: id(990001) }).first();
    expect(smuggled).toBeUndefined();
  });

  test("pooling: sequential txns with different contexts on the same connection do not leak", async () => {
    // txn 1: context A1 → sees A1 only.
    const first = await withFacilityContext([FACILITIES.A1.id], (trx) => trx("assessments").select("id"));
    expect(first.map((r) => r.id)).toEqual([ASSESSMENTS.A1.id]);

    // txn 2: context B1 on the SAME connection → sees B1 only. If txn 1's
    // context had leaked, we'd see A1 here (or both).
    const second = await withFacilityContext([FACILITIES.B1.id], (trx) => trx("assessments").select("id"));
    expect(second.map((r) => r.id)).toEqual([ASSESSMENTS.B1.id]);

    // After both txns, a context-free query on the same connection → 0 rows.
    const after = await appDb("assessments").select("id");
    expect(after).toEqual([]);
  });
});
