# Decision: facilityScope commits the request transaction BEFORE flushing the response

**Date:** 2026-07-03 · **Status:** DECIDED (implemented) · **Phase:** P3 · **Touches:** P2 infrastructure (`src/middleware/facilityScope.js`)

## Deviation flag

This modifies a **P2 core file** (`facilityScope`, the per-request RLS transaction/context middleware) during P3. Surfacing it explicitly per the "implicit decisions made explicit" rule. It is behaviour-preserving for tenant isolation; it changes only *when* the request transaction commits relative to the response.

## Problem (found during P3 (d) via a flaky test)

`facilityScope` held the request's RLS transaction open and resolved the scope (→ COMMIT) on `res.on("finish")` — which fires **after** the response bytes are flushed to the client. Consequence for the new write endpoints:

- **Read-your-writes gap:** a client that saves and then immediately re-reads on a *fresh* request/connection could see stale data, because the 2xx returned before the write's COMMIT landed. This surfaced as an intermittent P3 integration failure (a `DELETE` → 200, but a follow-up `SELECT` on the base pool still saw the row).
- **Ack-before-durable:** the client was told "success" before the commit was durable. Harmless in practice here (READ COMMITTED, no deferred constraints, savepoint already succeeded) but a real correctness smell for a write API.

P2 never hit this: its only mutation route (`/workflow`) is asserted for "DB unchanged after 4xx", never for "DB reflects the write, read immediately on another connection".

## Decision

Commit the request transaction **before** flushing the response. `facilityScope` now intercepts `res.end`: on first call it captures the flush, resolves the scope (→ COMMIT), and only then performs the real `res.end`. `res.on("close")` still resolves with a no-op flush if the client hangs up early.

Result: a 2xx write is durable before the client can observe it → reliable read-your-writes, and no ack-before-commit. Reads pay one extra commit round-trip (a no-op transaction release) — negligible.

## Alternatives rejected

- **Poll/retry in tests only.** Would hide the real read-your-writes gap and leave it in the product; also spreads a band-aid across dozens of assertions. One correct middleware fix is smaller and honest.
- **Commit-per-mutation inside the route.** The RLS context lives on the request transaction; content mutations are savepoints on it. Committing mid-request would drop the context for the rest of the request.

## Verification

Full unit (250) + integration (107) green, and the previously-flaky delete/audit assertions are now deterministic across repeated runs. `rlsWiring.test.js` / `rls.test.js` (which drive `runInFacilityScope` directly, not the response hook) are unaffected. Revertable in isolation if it ever proves problematic.
