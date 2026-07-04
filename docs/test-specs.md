# Acceptance Test Specifications (per roadmap phase)

**Audience: the agent executing a roadmap phase.** These specs are the definition of done. A roadmap item may only be ticked when its tests below exist, run in `make test`, and pass. They are deliberately concrete — implement them as written; if reality forces a deviation, record it in `docs/decisions/` and say so in SESSION_LOG, don't silently skip.

## Ground rules (apply to every phase)

1. **Write the test first where feasible** (red → green). At minimum, demonstrate each new test FAILS if its guard is removed (e.g., comment out the middleware, watch the test fail, restore). State this check in SESSION_LOG.
2. **Never weaken gates to pass**: the 95% server-services coverage threshold, existing assertions, and existing test counts are floors. If a change breaks an existing test, the change is wrong or the test's contract shifted — explain which, in SESSION_LOG, before touching the test.
3. **Two test layers, don't confuse them:**
   - *Unit/route tests* (existing pattern, `server/tests/routes.test.js` style): DB mocked, fast, cover logic/permissions/validation.
   - *Integration tests* (NEW harness, P2 builds it): REAL Postgres via `TEST_DATABASE_URL`, migrations run in `beforeAll`, per-suite fixture data, transactions rolled back or tables truncated between tests. **Never mock the DB here — the entire point is proving the SQL/RLS behaves.**
4. **Every new route ships with**: 401 unauthenticated, 403 wrong-role (test EVERY disallowed role, not just one), 403/404 cross-tenant, 400 validation (Zod), happy path asserting the response shape AND the audit row.
5. **Client**: every new user-visible flow gets an RTL test (happy + error path). Coverage floor 80% on auth/features/routes stays.
6. Test names must state the rule they prove: `test("Reviewer cannot PATCH assets (403 ROLE_NOT_ALLOWED)")`, not `test("patch works")`.

---

## P0 — Infra grounding (landed 2026-07-03; remaining = manual)

Automated (done): `server/tests/envCookieSameSite.test.js` — COOKIE_SAME_SITE guard (default/lax/case/none+Secure/none-without-Secure throws/invalid throws) and DATABASE_SSL defaults.

Manual staging smoke (user, `docs/infrastructure.md` §7) — record results in SESSION_LOG verbatim:
- [ ] `/health` 200 on Render; login returns token; dashboard renders live data.
- [ ] Idle >15 min → next action silently refreshes (proves `COOKIE_SAME_SITE=none` works cross-site).
- [ ] MFA enroll + verify + trusted-device skip on second login.
- [ ] `SELECT extname FROM pg_extension WHERE extname='vector'` returns a row in Supabase.

## P2 — Tenant isolation

**Deliverable 0 — the integration harness (build first): ✅ LANDED 2026-07-03.**
As-built (refined from the original spec): `server/jest.integration.config.js` (separate from the unit config; the default `npm test` ignores `tests/integration/` via `testPathIgnorePatterns`), `tests/integration/{requireTestDb,env-setup,global-setup,fixtures}.js`. `env-setup` maps `TEST_DATABASE_URL`→`DATABASE_URL` (no SSL, NODE_ENV=test) before app modules load; `global-setup` runs `knex migrate:latest`; each test file truncates + reseeds in `beforeAll`. npm `test:integration` **fails loudly** if `TEST_DATABASE_URL` is unset (verified). Wiring refinement (recorded, deviates from "make test must fail loud"): `scripts/test.sh` runs integration only when `TEST_DATABASE_URL` is set and prints a **prominent WARNING banner** (not a silent skip) when it isn't — this keeps the fast DB-free unit loop usable for a solo dev while making a non-run impossible to miss. Phase DoD still requires `test:integration` green before shipping P2.
- Canonical fixture (`server/tests/integration/fixtures.js`): **2 operators** (Op-A, Op-B) × 2 facilities each; per facility: 1 Author, 1 Reviewer; per operator: 1 HQ Executive, 1 Approver, 1 Mitigation Owner, 1 cross-facility Admin; 1 assessment per facility with ≥1 asset/threat/link/evaluation/mitigation. Deterministic UUIDs like `seed.js`.

**Deliverable 1 — route-guard introspection test** (`middlewareCoverage.test.js`):
- Walks the Express router (`app._router.stack`) and asserts EVERY route under `/api/assessments`, `/api/mitigations`, `/api/admin`, and any future data module includes BOTH `authenticate` and `requireFacilityAccess` (or a documented repo-scoped equivalent, listed in an explicit in-test allowlist with a comment justifying each entry). **This test is the regression guard that makes "someone added an unguarded route" impossible to miss.** New routes must never be added to the allowlist to make the test pass — fix the route.

**Deliverable 2 — cross-tenant matrix** (`tenantIsolation.test.js`, integration):
For each data endpoint × each role, logged in as an Op-A/facility-1 user targeting an Op-B resource:
- GET by id → 404 (not 403 — do not leak existence) with `ASSESSMENT_NOT_FOUND`-style code.
- List endpoints → only own-facility rows; assert the OTHER tenant's known ids are absent.
- Mutations (once P3 lands, extend the matrix) → 404/403, AND assert the row is unchanged in the DB afterward.
- HQ Executive of Op-A: sees ALL Op-A facilities, ZERO Op-B rows.
- Cross-facility Admin flag: within its operator only (unless engagement-scoped — assert current behavior explicitly).

**Deliverable 3 — repo scoping** (`repositoryScoping.test.js`, integration):
- `listAssessmentsForUser` must scope IN SQL: after the P2 rewrite, assert with `knex.on('query')` capture (or `toSQL()`) that the emitted SQL contains a facility/operator predicate — this catches a regression to fetch-all-then-filter-in-JS.
- Every repository list/get function called with a user scoped to facility-1 returns zero rows from facility-2, proven against real seeded data.

**Deliverable 4 — RLS policies** (`rls.test.js`, integration):
- Connect as the NEW non-owner app role (P2 creates it — table owners bypass RLS).
- With `SET LOCAL` facility context inside a transaction: `SELECT * FROM assessments` (no WHERE) returns ONLY the context facility's rows.
- Without any context set: zero rows (default-deny), not all rows.
- A raw `UPDATE assessments SET name='x' WHERE id=<other-tenant-id>` affects 0 rows.
- Prove the pooling assumption: two sequential transactions with different `SET LOCAL` contexts on the SAME connection do not leak context.

## P3 — Write/section API (per `docs/decisions/2026-07-03-write-section-api.md`)

For EVERY new endpoint (assets, threats, links, evaluations, contributors, section text, withdraw/recall, reassignment, mitigation assignment), all six of the ground-rule cases (rule 4) **plus**:

**Optimistic concurrency (`lockVersion.test.js`, integration):**
- Send `lockVersion` the client read → 200; response carries incremented `lockVersion`; DB row matches.
- Send a stale `lockVersion` → 409, body names the conflict code, DB row UNCHANGED.
- True race: fire two concurrent PATCHes with the same `lockVersion` (Promise.all) → exactly one 200 and one 409. Do not fake this with sequential calls.
- Missing `lockVersion` in body → 400 (validation), never a silent last-write-wins.

**State/role guards:**
- Content writes allowed only in `Draft` (Author); each of `In Review`, `Awaiting Approval`, `Approved` → 409/403 per the state machine; assert against a matrix, not one sampled state.
- Every non-Author role → 403 on every content write.

**Audit (`writeAudit.test.js`):**
- Every successful mutation writes exactly ONE audit row: correct `action_type` (lowercase-hyphen vocabulary), `facility_id`, `assessment_id`, `diff` containing before/after of changed fields only, `trace_id` echoing the request's.
- Failed mutations (409/403/400) write NO content-change audit row.
- Audit write and data write are atomic: force the audit insert to fail (mock/constraint) → the data change rolls back.

**Section text (new schema):**
- Round-trip: PUT section 1 text → GET assessment bundle returns it verbatim (unicode, long text, empty string).
- Migration is additive + idempotent (run `migrate:latest` twice in a test).

**Withdraw/recall race (closes the AGENTS.md known concern):**
- Author recalls while state is `In Review` and lockVersion matches → 200; Reviewer's subsequent submit-review → 409.
- Recall with stale lockVersion → 409 (the "Reviewer already acted" race).

**Client flip (RTL):**
- Prod mode (`VITE_ENABLE_DEMO=false` mocked): section save calls the API with `lockVersion`, renders success; on 409 renders the "modified by another user — reload" affordance (assert exact user-facing copy exists, not the raw code).
- Demo mode still uses fixtures (no fetch fired — assert with a fetch spy).
- Cross-tenant matrix (P2 deliverable 2) EXTENDED to every new mutation.

## P3.5 — Word/PDF export

- **Golden-content test** (integration): export the seeded assessment → parse the .docx (unzip + XML or a docx reader) and assert: all 9 section headings present and ordered, front-matter tables (approvals/contributors) contain the seeded names, every seeded mitigation row appears, assessment name/facility correct. Do NOT byte-compare the whole file (fonts/timestamps make that brittle) — assert content.
- PDF: non-empty, `%PDF` magic bytes, page count > 0, extractable text contains assessment name.
- Permissions: matrix of roles per §16 export rules; disallowed → 403; every export writes an `export`-vocabulary audit row.
- Approved assessments export the frozen snapshot (edit post-approval via mitigation progress → export reflects rules in §16.2).
- Perf guard: seeded assessment exports in <30s inside the test (generous CI margin; §18.6 target).

## P4 — AI module + features

**Module unit tests (gateway fully mocked — no network in CI):**
- Cost ceilings: at 79% of budget → call proceeds, no alert; ≥80% → alert emitted once (not on every call); at 100% → call REFUSED with `cost_ceiling_hit`, audit row written, other facilities unaffected; month rollover resumes.
- Audit: every call (success, error, timeout, rate_limited, ceiling) writes ALL §9.7 fields; assert the full field list explicitly; `provider`/`model` reflect what the gateway reports, not what was requested, when they differ.
- Facility scoping: prompt-context builder given facility-A request + any facility-B entity → THROWS (not filters silently); cross-facility allowed only for the consistency-flagging system job.
- No silent fallback: primary model error → error surfaces to caller; assert no second model call fired.
- Retry: transient failure → exactly one backoff retry; second failure → user-facing "temporarily unavailable" error shape.
- Mitigation Owner: every AI endpoint × Mitigation Owner session → 403 (matrix).

**Architectural invariant test (`aiImportBoundary.test.js`):** scan `server/src/**` (fs walk in-test) and assert NO file outside the AI module directory imports `ai`, `@ai-sdk/*`, or any provider SDK. This mechanically enforces businesslogic §9's code-review rule — a weaker model cannot accidentally bypass it.

**Per feature:** semantic search (embedding written on library create/update; results filtered to requester's facility — seed identical entries in two facilities, assert only one returns; similarity ordering deterministic with mocked embeddings) · smart tagging (out-of-vocabulary tags DISCARDED — mock the model returning 2 valid + 2 invalid, assert exactly 2 persist; audit records suggested AND confirmed separately) · drafted summary (role/state gating per §9.1 incl. 403 for non-Authors; AI original retained in audit next to edited final) · anomaly engine (each deterministic rule: one positive + one negative case; acknowledgement suppresses per-Author only) · consistency flagging (synthetic portfolio with a known 2σ outlier → flagged; non-outlier → not; operator-portfolio boundary respected).

## P4.5 — Platform Console

Decisions bound 2026-07-04: support access = **link-only** (audited self-assignment of a normal role; no impersonation/dual-identity session); entitlement toggle = **owner-only v1**. Plan: `docs/plans/p4-execution-plan.md` (O8/O9).

**Role gating & allowlist (integration):**
- Matrix: every operator role (Author, Reviewer, Approver, HQ Executive, Admin, Mitigation Owner) × each `/api/platform/*` route → **403**; Platform Owner (allowlisted) → 200. Unauthenticated → 401.
- Allowlist is a second independent gate: a user holding a Platform Owner role assignment whose email is NOT in `PLATFORM_OWNER_EMAILS` → 403 (a stray role row is inert). Allowlist parsing tolerates whitespace and case.
- MFA: Platform Owner is in `MFA_REQUIRED_ROLES` — assert via the existing mfaPolicy unit surface (role → required) plus one login-path integration case mirroring the Admin enforcement tests.
- `middlewareCoverage.test.js` extended: `/api/platform` classified as a PLATFORM mount requiring `authenticate` + `requirePlatformOwner` on every route; the existing DATA_MODULES rules unchanged (no new allowlist entries for platform routes).

**Isolation non-weakening (integration — the critical suite):**
- The existing cross-tenant route matrix and RLS suites (`rls.test.js`, `rlsWiring.test.js`, cross-tenant matrix) pass **UNCHANGED** with the platform router mounted.
- An operator-role session calling any `/api/platform/*` route gets 403 and zero cross-tenant data in the body.
- After a Platform Owner request completes, a subsequent normal-route request on the same process still enforces facility scoping (platform queries must not leak an unscoped GUC/connection state).

**Provisioning (integration):**
- Happy path: `POST /api/platform/operators` creates operator → facility → initial Admin user → role assignments → §19 seed defaults (assert: 8 threat classifications, 5×5 matrix, risk bands, seeded libraries present for the new facility) in ONE transaction; response returns the created ids.
- Atomicity: force a mid-transaction failure (spy-throw on a late repository call, e.g. role assignment) → NOTHING persists (operator, facility, user all absent) and a 500 with traceId returns.
- `copyLibrariesFromOperatorId`: library entries copied to the new facility; source operator untouched.
- One platform audit row per provision (`platform-operator-provisioned`) with the owner's userId + traceId; none on a failed provision beyond the transaction rollback.

**Support access — link-only (integration):**
- Grant: `POST .../support-access` creates a NORMAL role assignment for the owner in the target facility + audit row `platform-support-access-granted`; the owner then passes existing role guards when acting under that role, and tenant audit rows record their real user id.
- Revoke: `DELETE` removes the assignment + `platform-support-access-revoked`; subsequent tenant-scoped calls under that role → 403/404.
- No impersonation surface exists: assert no route accepts an "act as user X" parameter.

**Entitlement toggle & read-time gating (integration):**
- `PUT /api/platform/facilities/:id/entitlements` upserts + writes `entitlement-toggled` audit row (old→new in diff/metadata); operator roles → 403 (matrix above).
- Read-time effect: with `anomaly_detection` disabled for facility A, the anomaly endpoint → 403 `FEATURE_NOT_ENABLED` and the mocked gateway records ZERO calls; enable → same request succeeds. Facility B unaffected.
- Base features (semantic search, tagging, drafted summary) work with NO entitlement rows present.
- Capabilities read surface reflects the toggle (active vs enquire-to-enable) per facility.

## P5 — Hardening

- Email: mocked transport; reset email → correct recipient, link contains `APP_BASE_URL` + a token that the reset endpoint then accepts (full loop in one test); send failure → surfaced, audit row.
- Audit retention: seed entries older than policy → job deletes/archives them, younger survive, the deletion itself is audited; per-facility retention override honored.
- Redis swap: existing rate-limit + MFA-replay tests must pass UNCHANGED against the Redis-backed implementation (that's the point of the abstraction); plus TTL expiry test with fake timers.
- Monitoring: error handler still returns safe shape + traceId with the tracker wired in (no PII in captured events — assert scrubbing on a synthetic event containing an email).

## Side-quest — dark mode

Visual work: no new unit gates. Keep the existing rule — token classes only (assert no `zinc-*` in changed files via grep in the session, not a test), tests unaffected.
