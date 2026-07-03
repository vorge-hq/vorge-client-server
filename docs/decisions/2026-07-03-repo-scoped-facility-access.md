# Decision: facility isolation via repo-scoped getters as the `requireFacilityAccess` equivalent

**Date:** 2026-07-03 · **Status:** ACCEPTED · **Phase:** P2 (tenant isolation)

## Context

AGENTS.md invariant 1 originally read: *"Every data route must use both `authenticate` and `requireFacilityAccess` middleware."* Taken literally, that is not how the codebase enforces isolation today, and the P2 route-guard introspection test (`server/tests/middlewareCoverage.test.js`, test-specs §P2 deliverable 1) forced the discrepancy into the open:

- `requireFacilityAccess` middleware is wired into **zero** routes.
- Every data route that touches a specific resource carries only a **resource id** in the URL (`/:assessmentId`, `/:mitigationId`), **not** a `facilityId`/`operatorId` in the request body or params.
- `requireFacilityAccess(getScope)` reads `facilityId`/`operatorId` off the request and calls `canAccessFacility`. With no facility in the pre-load, the middleware has nothing to check — it cannot run *before* the resource is fetched, because the facility is a property of the resource, not the request.

## Decision

Recognise **two** equally-valid ways for a data route to enforce tenant isolation, and make the introspection test assert one of them is present on every data route:

1. **Middleware guard** — `authenticate` + `requireFacilityAccess`. Correct when the request itself names the facility/operator being acted on (this is the expected shape for most **P3 write endpoints**, whose payloads carry `facilityId`).

2. **Repo-scoped getter** — `authenticate` + a repository accessor that takes `{ user, actingRole }` and returns **only in-scope rows** (`null`/`[]` for out-of-scope), so the route answers **404** (no existence leak) or an empty list. Correct when the route addresses a resource by id and the facility is discovered by loading it.

Both are defensible; the getter approach is actually **stronger** for by-id routes because the scope check and the fetch are the same query — there is no window where a resource is loaded before the check.

## Where each applies today (the allowlist)

`REPO_SCOPED_ALLOWLIST` in `middlewareCoverage.test.js` is the single source of truth. Current entries and their scoping getter:

| Route | Scoping getter |
|---|---|
| `GET /api/assessments/` | `listAssessmentsForUser` — SQL facility/operator predicate (`facilityScopeFor`), default-deny |
| `GET /api/assessments/:assessmentId` | `getAssessmentBundleForUser` — user-scoped → `null` → 404 |
| `POST /api/assessments/:assessmentId/workflow` | `getAssessmentForUser` — user-scoped → `null` → 404 |
| `GET /api/mitigations/mine` | `listMine` — scoped to the acting Mitigation Owner's assignments |
| `POST /api/mitigations/:mitigationId/log` | `getMitigationForUser` — user-scoped → `null` → 404 |
| `GET /api/admin/configuration` | no tenant data (static surface list); gated by `authorizeRole(ADMIN)` |

The behavioural proof that each is genuinely isolated is `tests/integration/tenantIsolation.test.js` (cross-tenant matrix, real Postgres). The introspection test proves only that the guard is *wired*; the matrix proves it *works*.

## Rules (enforced by the test)

- A route with a `facilityId`/`operatorId` in its **payload** must use `requireFacilityAccess`. Do **not** add such a route to the allowlist to make the test pass — that is the failure mode the guard exists to catch.
- Every allowlist entry must name its scoping getter and correspond to a live route (the test fails on stale entries).
- Any new `/api/*` router mount must be classified as data (guarded) or non-data (documented), or the test fails.
- `requireFacilityAccess` returns a **named** function (`requireFacilityAccessMiddleware`) so the router-stack walk can detect it; do not rename without updating the test constant.

## Consequences

- AGENTS.md invariant 1 wording updated to reference this record (middleware **or** repo-scoped getter).
- Defense-in-depth is unchanged: RLS policies (P2 deliverable 4) remain the belt to this braces and are still required before real customer data.
