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
- Permanent failures (F2 2026-07-04): a gateway error classified permanent (statusCode ∈ {400,401,403,404,413,422} or schema-validation/invalid-prompt names — classifier at the gateway seam) is NOT retried: exactly one gateway call, `502 AI_CALL_FAILED`, audit row outcome `error` with `metadata.permanent=true`. Untagged/unknown errors default to transient (one retry).
- Scope guard (F2 2026-07-04): `runAiCall` with no facility/operator scope → 500 `AI_SCOPE_MISSING`, nothing runs; a gated facility feature (`anomaly_detection`) without `facilityId` → same — never a silent ungate. `consistency_flagging` is the only gated feature allowed operator-scoped.
- Mitigation Owner: every AI endpoint × Mitigation Owner session → 403 (matrix).

**Architectural invariant test (`aiImportBoundary.test.js`):** scan `server/src/**` (fs walk in-test) and assert NO file outside the AI module directory imports `ai`, `@ai-sdk/*`, or any provider SDK. This mechanically enforces businesslogic §9's code-review rule — a weaker model cannot accidentally bypass it.

**Per feature:** semantic search (embedding written on library create/update; results filtered to requester's facility — seed identical entries in two facilities, assert only one returns; similarity ordering deterministic with mocked embeddings) · smart tagging (out-of-vocabulary tags DISCARDED — mock the model returning 2 valid + 2 invalid, assert exactly 2 persist; audit records suggested AND confirmed separately) · drafted summary (role/state gating per §9.1 incl. 403 for non-Authors; AI original retained in audit next to edited final) · anomaly engine (each deterministic rule: one positive + one negative case; acknowledgement suppresses per-Author only) · consistency flagging (synthetic portfolio with a known 2σ outlier → flagged; non-outlier → not; operator-portfolio boundary respected; only ENTITLED facilities enter clustering — seed one entitled + one not, assert the non-entitled facility's data absent from prompts and flags — F2 2026-07-04).

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

## P6 — Offline / Field mode

Decisions bound 2026-07-04 (`docs/decisions/2026-07-04-offline-mode-architecture.md`): **whole-assessment checkout** (exclusive lease; supersedes businesslogic §8 per-section), PIN-only offline auth, deviceEditAt in audit `metadata` (server `created_at` never backdated). Plan: `docs/plans/p6-offline-execution-plan.md` (O1–O6, gates F4/F5).

**Free-tier fallback (RTL, O1):**
- Connectivity loss with no active checkout → workspace fields disabled + the read-only banner; typing impossible; NO ops queued and NO fetch fired while offline (fetch spy).
- Reconnect → fields re-enable; demo mode behavior unchanged (spy: zero new calls).

**Checkout lifecycle (`offlineCheckout.test.js`, integration, O2):**
- All six ground-rule cases per new route, plus: `POST /checkout` with `offline_mode` disabled (no entitlement row) → 403 `FEATURE_NOT_ENABLED` and NO checkout row created; enabled → 201 with `checkoutSecret` + `deviceToken` + full bundle; facility B unaffected.
- Non-Author → 403; non-Draft → 409 `INVALID_ASSESSMENT_STATE`; second checkout → 409 `ALREADY_CHECKED_OUT` naming the holder.
- True race: two concurrent `POST /checkout` (Promise.all) → exactly one 201 and one 409 (row lock + partial unique index — do not fake sequentially).
- Owner `DELETE /checkout` → status `released` + `offline-checkout-released` audit row; Admin force-release → `force_released` + audit; non-Admin force-release → 403.

**Guard block (`checkoutGuard.test.js`, integration, O2):**
- While a checkout is active: every content write endpoint, `POST /workflow`, and `PUT /lead-author` → 409 `ASSESSMENT_CHECKED_OUT` **including for the checkout owner's own online session**; target rows unchanged. Red-check: removing guard step 3.5 makes this fail.
- After sync/release/force-release, the same writes succeed again with the post-replay lockVersion.
- `GET /api/assessments` and `GET /:id` expose `checkout {userId, expiresAt}` while active, `null` after.

**Sync replay (`offlineSync.test.js`, integration, O3):**
- Happy path: a batch covering EVERY op type (asset/threat create-update-delete with client UUIDs, link-set with `evaluationId` passthrough, evaluation-update against the client-created id, section-set) → 200, entities present with the client-supplied ids, lockVersion = base + opCount, one audit row per op with `metadata {offline: true, checkoutId, opId, deviceEditAt}` and server `created_at` (hash chain verifies across the batch).
- All-or-nothing: batch whose 5th op fails validation → 422 `SYNC_OP_FAILED` naming the opId; ops 1–4 ABSENT from the DB; no batch row; lockVersion unchanged.
- Wrong user → 403 `CHECKOUT_NOT_YOURS`; wrong secret → the SAME code (no factor leak); revoked checkout → 409 `CHECKOUT_REVOKED`; already-synced → 409 `CHECKOUT_ALREADY_CLOSED`.
- Entitlement disabled AFTER checkout → sync still succeeds (never strand field data); new checkout still 403.
- Late sync (past `expires_at`, still `active`) → succeeds.

**Sync isolation (integration — the critical suite, O3):**
- Tenant A syncing with a forged/real Tenant-B `checkoutId` → 404 `CHECKOUT_NOT_FOUND` (not 403), zero B rows touched (assert unchanged in DB).
- Tenant A `POST /checkout` on a B assessment → 404 `ASSESSMENT_NOT_FOUND`; force-release cross-tenant → 404.
- Existing cross-tenant matrix and RLS suites pass UNCHANGED with the offline routes mounted.

**Idempotency & ordering (integration, O3):**
- Replay the same `requestId` → 200 with the byte-identical stored response; op count in DB unchanged (no double-apply).
- `batchSeq` gap or repeat → 409 `SYNC_BATCH_OUT_OF_ORDER`; nothing applied.

**Client offline branch (RTL fetch-spy, O4):**
- With an active local checkout: every WorkspaceContext write resolves `{ok:true}`, fires ZERO fetches, and appends the correctly-shaped op (type/payload/opId/deviceEditAt) to the queue store (fake IDB).
- Workspace hydrates from the IDB snapshot + queued ops, not the network; demo mode untouched (spy).

**Sync UX (RTL, O5):**
- Reconnect with pending ops → sync affordance; success drains the queue and shows post-sync lockVersion state; `CHECKOUT_REVOKED` renders the export-queue-to-file affordance (download fired); retry after a network drop reuses the SAME requestId.

**PIN & wipe (unit + integration, O6):**
- Crypto round-trip: PIN → PBKDF2(600k, per-checkout salt) → AES-GCM encrypt/decrypt; wrong PIN fails the pinCheck without exposing plaintext; no PIN hash stored anywhere (assert store contents).
- 5th failed attempt → `checkouts` + `opQueue` cleared, wipe marker `{checkoutId, wipedAt}` persisted; next online session POSTs wipe-report → exactly one `offline-cache-wiped` audit row; checkout status unchanged (Admin decides).
- Window expiry locks the offline sign-in but PRESERVES the queue (lockout ≠ data loss).

## Side-quest — Guest read-only access

Plan: `docs/plans/guest-viewer-execution-plan.md` (G1–G6, gate F-G). Decisions bound there: role name **Guest**; MFA **exempt** + Guest MFA-enroll blocked; export **BLOCKED** for Guest; guest scoped to **one facility** (seed: bonny; integration fixtures: Op-A/facility-1); seed password from `SEED_GUEST_PASSWORD` (unset → guest not seeded). Deny expectations below are exact-code assertions — a test passing on "some 4xx" is a spec violation.

**Unit — permissions & policy (`server/src/services/permissionService.test.js` additions or `server/tests/guestPermissions.test.js`, G1):**
- **G-U1** `canReadAssessment({actingRole: Guest})` → true; `canAccessAssessmentSections` → true; `canComment` (both scopes, all states) → false; `canViewAudit` (inline/summary/full) → false.
- **G-U2** `canExportAssessment({actingRole: Guest})` → false; for EACH of the six pre-existing roles, `canExportAssessment` equals the old `canAccessAssessmentSections` result (regression table — proves the export-route swap changes Guest only).
- **G-U3** `getAssessmentPermissions({actingRole: Guest, …})` → `canRead: true`, `canAccessSections: true`, `canExport: false`, every write/comment/audit flag false. Assert the FULL returned object (vacuous-green guard).
- **G-U4** `mfaPolicy`: `requiresMfa(user with only a Guest assignment)` → false; `roleRequiresMfa("Guest")` → false; `MFA_REQUIRED_ROLES` still has exactly {Approver, HQ Executive, Admin} (size + members — fails loudly if someone "helpfully" adds Guest).
- **G-U5** `canEditAssessmentContent({actingRole: Guest, assessmentState: Draft})` → false (Guest is not Author even in Draft).

**Unit — mechanical coverage tripwire (`server/tests/guestDenyCoverage.test.js`, G3):**
- **G-C1** Router introspection (walker pattern from `middlewareCoverage.test.js`): the set of every non-GET route under `/api/assessments`, `/api/mitigations`, `/api/admin`, `/api/library` plus `/api/auth/switch-role`, `/api/auth/mfa/enroll-start`, `/api/auth/mfa/enroll-verify` equals `GUEST_DENY_MANIFEST` (from `server/tests/guestDenyManifest.js`) — set equality both directions, so a new mutating route without a manifest entry (and thus without a Guest-deny integration case) fails CI. Auth flow routes a guest legitimately uses sit in an in-test `AUTH_ALLOWED` list, each entry carrying a justification comment.
- **G-C2** All five AI endpoints (`suggest-tags`, `tags/confirm`, `generate-draft`, `anomaly-check`, `anomaly-acknowledgements`) carry `rejectGuest` middleware in their stack (introspect the layer names, same technique the coverage test uses for `authenticate`).
- **G-C3** `rejectGuest` unit: acting role Guest → DomainError 403 `ROLE_NOT_ALLOWED`; every other role → `next()` with no error.

**Integration — access & isolation (`server/tests/integration/guestAccess.test.js`, G3; real DB, fixture guest on Op-A/facility-1):**
- **G-I1** Guest login: `POST /api/auth/login` → 200, token, `mfaRequired` falsy; an authed `GET /api/auth/me` works with no MFA step (self-serve proven).
- **G-I2** `GET /api/assessments` → 200; body contains ONLY the guest facility's assessment ids; assert the sibling-facility and Op-B known ids are ABSENT (explicit id list, not just length).
- **G-I3** `GET /api/assessments/:id` (in-scope) → 200; `permissions.canRead === true`, `canEditContent === false`, `canExport === false`; `allowedWorkflowActions` is empty; bundle contains sections/assets/threats/evaluations (reads genuinely work).
- **G-I4** `GET /api/library?facilityId=<in-scope>` → 200 rows (guest reads library); `GET /api/mitigations/mine` → 403 `ROLE_NOT_ALLOWED`; `GET /api/assessments/consistency-flags` → 403 `ROLE_NOT_ALLOWED`; every `/api/admin` GET → 403 `ROLE_NOT_ALLOWED`.
- **G-I5** Sibling-facility probe (same operator, no guest assignment): `GET /api/assessments/:coralId` → 404 `ASSESSMENT_NOT_FOUND` (not 403 — no existence leak).
- **G-I6** Cross-tenant probe: `GET` an Op-B assessment id → 404; Op-B ids absent from every list the guest can call.
- **G-I7** Export decision enforced: `GET /api/assessments/:id/export?format=docx` (in-scope) → **403 `ROLE_NOT_ALLOWED`** AND no `export` audit row is written (query `audit_log_entries` after).
- **G-I8** No escalation via switch-role: `POST /api/auth/switch-role {role:"Author"}` → 403 `ROLE_NOT_ASSIGNED`; same for every other role name.
- **G-I9** Forged claim: sign a token with the test `JWT_SECRET`, guest `sub`/`sid`, `actingRole:"Author"` → any data request → 403 `ROLE_NOT_ASSIGNED` (rejected by `hasAssignedRole`, proving the claim alone grants nothing).
- **G-I10** MFA-enroll block: guest `POST /api/auth/mfa/enroll-start` → 403 `ROLE_NOT_ALLOWED`; `enroll-verify` → 403; guest's `mfa_enabled` still false in DB (shared-account hijack closed).

**Integration — the write-deny matrix (`server/tests/integration/guestWriteDenial.test.js`, G3):**
- **G-I11** Drive EVERY `GUEST_DENY_MANIFEST` entry as the guest with a VALID payload (per-route payload map beside the manifest — the request must reach the role gate, never die at Zod 400). Expected results, exact codes:
  - Content writes via `contentWriteGuard` (assets POST/PATCH/DELETE, threats POST/PATCH/DELETE, `PUT /links/:a/:t`, evaluations PATCH, `PUT /sections/:n`, contributors PUT, `PUT /lead-author`, `PUT /:id/mitigations/:mid/owner`) → 403 `ROLE_NOT_ALLOWED` (in-scope Draft assessment, so role — not scope/state — is what's proven).
  - `POST /:id/workflow` with an action valid for the current state → 403 `ROLE_NOT_ALLOWED`.
  - AI: `suggest-tags`, `tags/confirm`, `generate-draft`, `anomaly-check`, `anomaly-acknowledgements` → 403 `ROLE_NOT_ALLOWED` (via `rejectGuest`; passes with `AI_ENABLED` unset because the guard outranks the 404 env check — assert 403 specifically).
  - `PATCH /consistency-flags/:flagId` → 403; library POST/PUT/DELETE → 403; every `/api/admin` mutation → 403; `POST /api/mitigations/:mid/log` → denied (403 or 404 per assignment scope — assert the actual code AND that no progress-log row was written).
- **G-I12** DB-unchanged proof: for one representative per content family, snapshot the target row (or count) before, assert identical after the deny; assessment `lock_version` unchanged after the whole matrix run.

**Integration — seed (`server/tests/integration/guestSeed.test.js` or extend the existing seed suite, G2):**
- **G-S1** With `SEED_GUEST_PASSWORD` set: run seed → guest user exists with deterministic id, `mfa_enabled false`, and exactly ONE Guest role assignment (facility bonny, deterministic id).
- **G-S2** Idempotency: run seed twice → still exactly one user row + one assignment row; password hash updated to the current env value (rotate-by-reseed works).
- **G-S3** With `SEED_GUEST_PASSWORD` unset: seed completes, guest user ABSENT, and the warning line was emitted (spy on console.warn).

**Client RTL (colocated, G4/G5 — use the `mfa.test.jsx` `authedSession` factory + the `*.write.test.jsx` fetch-spy pattern, `vi.stubEnv("VITE_ENABLE_DEMO","false")`):**
- **G-RTL1** (`navigation.js` test) `getNavigationForRole(GUEST)` non-empty, links to `/dashboard`; `getHomeRouteForRole(GUEST)` → `/dashboard`; `isRoleMfaRequired(GUEST)` → false.
- **G-RTL2** (`GuestDashboard.test.jsx`) Guest session renders the dashboard: hydrated assessment rows visible and navigable; NO create/submit/queue-action buttons (assert by accessible-name queries returning null).
- **G-RTL3** (`GuestDashboard.test.jsx` or workspace test) prod-mode hydration fires the reads (`GET /api/assessments`) — fetch spy asserts reads DO happen (guest is not demo).
- **G-RTL4** (workspace guest test, e.g. `AssessmentShell` or `AssessmentWorkspacePage` suite) Guest opens a section: the exact banner copy "You're exploring Vorge as a read-only guest — changes aren't saved." renders; all section inputs disabled/read-only; NO Save/workflow/export affordances (export hidden because `permissions.canExport` false).
- **G-RTL5** Attempted interaction fires ZERO mutating fetches: type/click through a section as Guest → fetch spy shows no POST/PUT/PATCH/DELETE (`callsMatching` on method), only reads.
- **G-RTL6** Clean 403: force a mutating call path (simulate a stale/handcrafted state that fires a write) with fetch mocked to 403 → the `READ_ONLY_MESSAGE` copy ("Your role can't make changes here — nothing was saved.") renders, optimistic state reverts, and NO success/"saved" indicator appears.
- **G-RTL7** `isAssessmentReadOnly({state:"Draft", actingRole: GUEST})` → true (net-new role→readOnly assertion; also pins the existing non-Author rule).

**Negative / regression:**
- **G-R1** Author still writes: one representative content write (e.g. `PUT /sections/1`) as the fixture Author → 200, lockVersion bump, audit row (proves G-blocks broke nothing).
- **G-R2** Mitigation Owner AI matrix unchanged: MitOwner × each AI endpoint → 403 (existing suite passes untouched).
- **G-R3** Export still works for permitted roles: Author (or Reviewer) export → 200 `%PDF`/docx magic + audit row (the `canExportAssessment` swap changed Guest only).
- **G-R4** Existing suites pass UNCHANGED: `middlewareCoverage`, `tenantIsolation`, `rls*`, unit route tests — counts are floors; no allowlist additions.
- **G-R5** Demo untouched: demo role-picker renders exactly the six pre-existing roles (no Guest option); `canDemoSwitchToRole(GUEST)` false even in a demo session; demo workspace still fires zero fetches.

## Side-quest — dark mode

Visual work: no new unit gates. Keep the existing rule — token classes only (assert no `zinc-*` in changed files via grep in the session, not a test), tests unaffected.
