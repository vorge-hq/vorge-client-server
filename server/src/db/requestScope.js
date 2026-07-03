// P2 · RLS app wiring — request-scoped DB connection + facility context.
//
// RLS (migration 202607030002) enforces tenant isolation only when the query
// runs, inside a transaction, on a connection that has set the per-transaction
// GUC `app.current_facility_ids`. This module is the seam that makes that happen
// without threading a connection through every call site:
//
//   - activeConn() returns the transaction pinned to the current async context
//     (set by runInFacilityScope), or the base pool when none is active. Every
//     repository default parameter is `trx = activeConn()`, so a repo call made
//     inside a scoped request automatically uses the scoped, GUC-carrying
//     transaction; a call made outside one (scripts, seeds, unit tests) uses the
//     base pool exactly as before.
//   - runInFacilityScope(ids, work) opens a transaction, sets the context on it
//     (set_config(..., true) is transaction-local — the pooling-safe form), and
//     runs `work` with activeConn() resolving to that transaction. AsyncLocalStorage
//     carries the binding across every await inside `work`.
//
// The base pool connects as the DB role in DATABASE_URL. On staging today that
// is the owner (bypasses RLS), so this wiring is inert until the app is pointed
// at the non-owner role — see docs/roadmap.md P2.
const { AsyncLocalStorage } = require("async_hooks");
const db = require("./knex");

const storage = new AsyncLocalStorage();

// The knex/trx the current async context should query through.
function activeConn() {
  const store = storage.getStore();
  return (store && store.conn) || db;
}

// Run `work` with its DB queries pinned to `facilityIds` via RLS. Commits when
// `work` resolves, rolls back if it throws. `conn` is injectable so tests can
// drive it through a non-owner connection; production passes the default pool.
function runInFacilityScope(facilityIds, work, conn = db) {
  return conn.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.current_facility_ids', ?, true)", [
      (facilityIds || []).join(",")
    ]);
    return storage.run({ conn: trx }, work);
  });
}

module.exports = { activeConn, runInFacilityScope, storage };
