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

**Deliverable 0 — the integration harness (build first):**
- `server/tests/integration/setup.js`: connects via `TEST_DATABASE_URL`, runs `knex migrate:latest`, truncates all tables between test files. Add npm script `test:integration` and wire it into `scripts/test.sh` so `make test` runs it. If `TEST_DATABASE_URL` is unset, the suite must **fail loudly** (not skip silently) with instructions to start the docker db.
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

## P5 — Hardening

- Email: mocked transport; reset email → correct recipient, link contains `APP_BASE_URL` + a token that the reset endpoint then accepts (full loop in one test); send failure → surfaced, audit row.
- Audit retention: seed entries older than policy → job deletes/archives them, younger survive, the deletion itself is audited; per-facility retention override honored.
- Redis swap: existing rate-limit + MFA-replay tests must pass UNCHANGED against the Redis-backed implementation (that's the point of the abstraction); plus TTL expiry test with fake timers.
- Monitoring: error handler still returns safe shape + traceId with the tracker wired in (no PII in captured events — assert scrubbing on a synthetic event containing an email).

## Side-quest — dark mode

Visual work: no new unit gates. Keep the existing rule — token classes only (assert no `zinc-*` in changed files via grep in the session, not a test), tests unaffected.
