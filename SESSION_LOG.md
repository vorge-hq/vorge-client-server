2026-07-03 — Staging smoke GREEN after redeploy: P2 verified LIVE
  Post-redeploy of the audit fix (8cfc5f9), full staging smoke passed against
  vorge-api-staging.onrender.com: /health 200; POST /api/auth/login 200 (token,
  Author, real user Adaeze Okeke); GET /api/assessments 200 → 3 scoped rows
  (Bonny Terminal ×2, Pernis Refinery Complex) served via the non-owner vorge_app
  role under RLS. Non-empty scoped data end-to-end confirms non-owner role +
  facilityScope context + RLS all working. P2 (tenant isolation) verified live.

================================================================

2026-07-03 — P2 hotfix: staging login 500 — audit writes denied by RLS (appendAuditLog self-scopes)
  Staging smoke caught a P0 regression from the RLS work: POST /api/auth/login
  returned 500 under the non-owner `vorge_app` role. Root cause (confirmed by a
  red-check reproducing the exact error `new row violates row-level security
  policy for table "audit_log_entries"`): login audits the event via
  appendAuditLog → INSERT into audit_log_entries, which is RLS-protected, but the
  auth routes don't run through facilityScope, so no app.current_facility_ids
  context was set → WITH CHECK denied the insert. Owner-run tests never saw it
  (owner bypasses RLS). Same latent break in getPreviousHash (no context → read
  returns nothing → hash chain would silently restart every entry).
  Fix: appendAuditLog now runs its read-back + insert inside a transaction (a
  SAVEPOINT when the caller already passed one, preserving atomicity with the
  caller's work; a real txn when called standalone e.g. failed-login) whose
  facility context is set to the entry's own facilityId. Covers all auth audit
  writes (login/logout/admin reset) and request-scoped ones alike. All 5 callers
  pass a non-null facilityId (auditAuthEvent early-returns when none).
  Test: rlsWiring.test.js +1 — appendAuditLog on the non-owner pool with no
  pre-set context succeeds AND chains the hash (2nd entry.previousHash == 1st
  hash). Red-checked (remove set_config → RLS-deny → fail).
  Tests: 226 server unit + 144 client + 39 integration (was 38, +1) green.
  Diagnosis of the earlier two 500s (already resolved by user before this): (1)
  URL-encoded password — `/` and `=` in the vorge_app password made DATABASE_URL
  an invalid URL (pg-connection-string threw); user rotated to a hex password.
  (2) Render env var name — app reads DATABASE_URL only (not VORGE_APP_DATABASE_URL,
  the local .env name); user corrected the Render var. This audit-RLS fix is the
  third and (pending redeploy + re-smoke) final blocker. NEEDS: commit → push →
  Render redeploy → re-run smoke to confirm vorge_app + RLS serve real data.

================================================================

2026-07-03 — P2 CLOSED: Supabase dashboard checkpoint complete, RLS live on staging
  User completed the manual checkpoint that flips RLS from tests-only to enforced:
    - Ran migration 202607030002_rls_policies on Supabase staging.
    - Created non-owner role `vorge_app` + grants in the Supabase SQL editor
      (NOT owner, NOT BYPASSRLS — so the policies apply to it).
    - Repointed Render `vorge-api-staging` DATABASE_URL at `vorge_app` (transaction
      pooler). (Secret lives only in Render/.env — never committed.)
    - Smoke passed: /health + browser login and data on vorge-app.vercel.app.
  Effect: the base pool now connects as a non-owner role, so the per-request
    facility context (runInFacilityScope/activeConn, shipped earlier today) is
    now load-bearing — RLS enforces tenant isolation on staging, beneath the
    repo/route guards. P2 deliverables 0–4 complete in code AND live.
  Docs: roadmap P2 section marked ✅ COMPLETE + checkpoint ticked + stale duplicate
    mitigations-hardcode item reconciled; production-status Phase 2 → ✅ Done (RLS
    live via vorge_app); CLAUDE.md Current focus → P2 done, P3 next (PAUSED for go).
  No code changed this entry — planning-doc + config commit only. Next: P3
    write/section API, on user go-ahead.

================================================================

2026-07-03 — P2 (cont.): RLS app wiring + AGENTS invariant 2 reconcile
  Closes the app half of deliverable 4: every assessments/mitigations request now
  runs its DB work inside a txn pinned to the acting role's facility context, so
  Postgres RLS enforces isolation beneath the repo-layer scoping.
  Added:
    - src/db/requestScope.js: AsyncLocalStorage-based activeConn() (returns the
      per-request scoped trx or the base pool) + runInFacilityScope(ids, work,
      conn=db) — opens a txn, SELECT set_config('app.current_facility_ids', ids,
      true), runs work in ALS so every await inside sees the scoped conn. Commits
      on resolve / rolls back on throw.
    - src/middleware/facilityScope.js: resolveFacilityIds (direct facilities +
      operator-wide roles expanded via a facilities lookup — RLS keys on
      facility_id only, so HQ/Admin operator scope must be expanded) then wraps
      the request in runInFacilityScope, committing on res finish.
  Changed:
    - facilityScopeFor MOVED assessmentRepository → facilityAccessService (so the
      middleware imports it without pulling a mocked repo; +4 unit tests for its
      HQ/Admin/dedup/empty branches to hold the 95% services gate).
    - assessment/mitigation/audit repos default trx = activeConn() (was = db), so
      reads/mutations auto-use the scoped txn; explicit-trx callers unaffected.
    - assessments + mitigations routers: router.use(facilityScope) after
      authenticate; content mutations use activeConn().transaction (savepoint on
      the request conn — inherits context, rolls back independently on conflict).
    - getAssessmentBundleById: Promise.all → sequential awaits (a single txn
      connection can't run concurrent queries; was tripping pg's deprecation).
    - tests/routes.test.js db mock: trx now carries .raw/.transaction/.fn.now.
  Added test:
    - tests/integration/rlsWiring.test.js (5 cases, as the NON-OWNER role):
      WIRED read inside runInFacilityScope returns the scoped facility's rows;
      UNWIRED same read (no context) returns [] (RLS default-deny — the safety
      net proving isolation holds even if repo filtering were bypassed); operator
      expansion; WIRED HQ sees only its operator's facilities; rollback on throw.
  Red-check: neutered set_config to an empty context → the two WIRED tests FAILED
    (RLS denied), UNWIRED/expansion/rollback still passed → reverted.
  Also reconciled AGENTS.md invariant 2: code is correct (isDemoEnabled() gates on
    VITE_ENABLE_DEMO === "true", deliberately not import.meta.env.DEV); aligned
    the doc to the code (heading "flag-gated" + mechanism). No decision record
    (per the new no-records-unless-asked rule).
  SAFE TO LAND / INERT UNTIL ROLE SWITCH: base pool still connects as owner →
    owner bypasses RLS → behavior unchanged; existing owner-role integration
    tests (tenantIsolation) still green through the new middleware. Enforcement
    turns on when DATABASE_URL points at the non-owner role (Supabase checkpoint).
  Tests: 226 server unit (was 222, +4) + 144 client + 38 integration (was 33, +5)
    green via `TEST_DATABASE_URL=... make test`. Services branch gate held (96%).
  === P2 REMAINING ===
  Only the Supabase dashboard checkpoint (create non-owner app role + grants,
  point DATABASE_URL at it) — then P2 is done. Deliverables 0–4 complete in code.

================================================================

2026-07-03 — Planning doc maintenance rules (no plan rewrites)
  AGENTS.md + CLAUDE.md: four-file upkeep table (roadmap tick-only, SESSION_LOG append,
  production-status status rows, Current focus sync). Explicit: do not restructure
  roadmap/production-status/strategic-roadmap unless user asks; no decision records
  unless asked. CLAUDE.md Current focus synced to P2-in-progress / P0-complete.
  Pre-commit hook nudge now includes docs/roadmap.md.

2026-07-03 — Disable AI co-author on commits
  Claude Code attribution off (`attribution.commit`/`pr` empty in .claude/settings.json).
  Agent rules in CLAUDE.md + AGENTS.md: no Co-Authored-By trailers on commits or PRs.

2026-07-03 — P2 (cont.): RLS policies as the non-owner app role (test-specs §P2 deliverable 4, DB layer)
  Defense-in-depth beneath repo-scoping + route guards. DB-layer scope only this
  session (per user decision); the invasive per-request txn-context wiring is the
  documented next step.
  Added:
    - migrations/202607030002_rls_policies.js: uniform tenant-isolation policy on
      all 10 facility-scoped DATA tables (assessments, assets, threats,
      asset_threat_links, evaluations, mitigations, audit_log_entries,
      mitigation_progress_logs, versions, library_entries). ENABLEs RLS on the 3
      that weren't already. Predicate: facility_id = ANY(string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true),''),',')::uuid[])
      for USING + WITH CHECK. Unset context → NULL → default-DENY. Idempotent
      (DROP POLICY IF EXISTS then CREATE; PG<15 has no CREATE POLICY IF NOT EXISTS)
      + down. NO FORCE ROW LEVEL SECURITY: the owner must bypass so migrations/seed
      can insert without context. Auth/lookup tables (users, role_assignments,
      operators, facilities) intentionally get NO policy — authenticate loads the
      user BEFORE any facility context exists.
    - tests/integration/global-setup.js: idempotently provisions a NON-OWNER
      LOGIN role vorge_app_rls (no BYPASSRLS) + DML grants — the local stand-in
      for the Supabase app role. Exports APP_ROLE/APP_PASSWORD.
    - tests/integration/rls.test.js (7 cases): connects AS the non-owner role.
      Context set → only that facility's rows; multi-facility context → both,
      zero Op-B; child table scoped identically; NO context → 0 rows (default-
      deny); cross-tenant UPDATE by id → 0 rows affected + owner-verified
      unchanged; cross-tenant INSERT → rejected by RLS (asserts /row-level
      security/ so it can't pass for an FK/NOT-NULL reason); pooling (pool max:1)
      two sequential different-context txns on the SAME connection do not leak.
  Red-check (ground rule 1): weakened the assessments policy to USING(true) on
    the test DB → 6/7 FAILED (the mitigations-only child test correctly still
    passed) → restored the policy.
  SAFE TO LAND NOW / INERT UNTIL ROLE SWITCH: the app still connects as owner
    (postgres) on staging → owner bypasses RLS → zero behavior change until the
    user points DATABASE_URL at the non-owner role (the checkpoint below).
  Tests: 222 server unit + 144 client + 33 integration (was 26, +7) green via
    `TEST_DATABASE_URL=... make test`.
  === CHECKPOINT FOR USER (Supabase dashboard) ===
    Create a NON-OWNER app role on Supabase + GRANT it DML on the public tables
    (NOT owner, NOT BYPASSRLS), then point the app's DATABASE_URL user at it.
    Until then RLS is enforced only in tests. SQL handed separately.
  === HANDOFF: P2 REMAINING (next session) ===
  Items 1 (route matrix), 2 (introspection), 4-DB (RLS policies+tests) DONE.
  Still TODO in P2:
    - RLS app wiring: wrap every request (reads too) in a txn that runs
      set_config('app.current_facility_ids', <resolved ids>, true) and thread the
      request-scoped trx through the repos (db singleton → request trx). Reuse
      facilityScopeFor to resolve the id list. Only meaningful once the non-owner
      role is live (checkpoint above).
    - Reconcile AGENTS.md invariant 2 wording (demo gating driven by
      VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.

================================================================

2026-07-03 — P2 (cont.): route-guard introspection test (test-specs §P2 deliverable 1)
  The "no unguarded route can be merged" regression guard.
  Added:
    - tests/middlewareCoverage.test.js (18 cases, UNIT loop — needs no DB, so it
      gates every `npm test`/commit, not just when TEST_DATABASE_URL is set).
      Walks app._router.stack; per data route asserts `authenticate` present
      (router-level or per-route) AND (`requireFacilityAccessMiddleware` present
      OR the method+path is in an in-test REPO_SCOPED_ALLOWLIST with a named
      scoping getter). Structural guards: any /api mount not classified as
      data/non-data fails; any stale allowlist entry (route removed, exemption
      left behind) fails.
  Decision (the wiring question the handoff flagged): requireFacilityAccess is
    wired into ZERO routes because by-id routes carry no facilityId in the
    payload — the middleware has nothing to check pre-load. Accepted a TWO-guard
    model: middleware for payload-facility routes (P3 writes), repo-scoped getter
    (getXForUser → null → 404) for by-id routes. Recorded in
    docs/decisions/2026-07-03-repo-scoped-facility-access.md; AGENTS.md invariant
    1 reworded to accept both; requireFacilityAccess's returned fn NAMED
    (requireFacilityAccessMiddleware) for stack-walk detectability.
  Red-check (ground rule 1): dropped an allowlist exemption → that route's
    facility assertion FAILED; injected a fake allowlist key → stale-entry guard
    FAILED; unclassified a real mount → classification guard FAILED. All reverted.
  Tests: 222 server unit (was 204, +18) + 144 client + 26 integration green via
    `TEST_DATABASE_URL=... make test`. Service coverage gate held (97%+).
  === HANDOFF: P2 REMAINING (next session) ===
  Items 1 (route matrix) + 2 (introspection test) DONE. Still TODO in P2, in order:
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase connects as owner/postgres → RLS bypassed). (a) migration
       creating policies keyed on a per-txn setting (SET LOCAL app.current_facility_ids
       / current_operator_id), (b) app wraps requests in a txn that SETs that
       context, (c) Supabase dashboard step to create+grant the non-owner role +
       point DATABASE_URL user at it → CHECKPOINT WITH USER. Test as the non-owner
       role via the harness (test-specs §P2 deliverable 4: no-context→0 rows,
       cross-tenant UPDATE→0 rows, sequential SET LOCAL on same pooled conn no leak).
    4. Reconcile AGENTS.md invariant 2 wording (demo gating driven by
       VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.
  Local test DB up: docker vantage-db (pgvector), database vorge_test. Re-run:
    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 (cont.): cross-tenant ROUTE matrix (test-specs §P2 deliverable 2)
  Built the penetration proof at the HTTP edge — supertest driving the live
    middleware+route stack against REAL Postgres (the P2 harness).
  Added:
    - tests/integration/session.js: auth helper. login(userKey, actingRole)
      loads the seeded user, mints a REAL session via sessionService.issueSession
      {mfaSatisfied:true}, then jwt.sign {email,actingRole,sid} subject=userId
      with env.jwtSecret — byte-for-byte the login route's signSessionToken.
      withAuth() attaches Authorization: Bearer + X-Acting-Role (and can force
      an unassigned role to prove ROLE_NOT_ASSIGNED).
    - tests/integration/tenantIsolation.test.js (17 cases): Op-A user targeting
      Op-B resources → GET :id 404 (ASSESSMENT_NOT_FOUND, no existence leak),
      sibling-facility-same-operator 404, list returns own-tenant rows only,
      POST workflow + POST mitigations/:id/log cross-tenant → 404 AND the target
      DB row asserted UNCHANGED (state/lock_version/status/progress-log count).
      Wrong-role 403 (ROLE_NOT_ALLOWED on workflow/admin/mine + ROLE_NOT_ASSIGNED
      on an unheld acting role); unauthenticated 401 on GET/GET:id/POST. HQ Exec
      §17.5 portfolio: Op-A HQ sees all Op-A facilities, ZERO Op-B (+ Op-B mirror).
      Covers every data route that exists today; mutation matrix EXTENDS when P3
      write endpoints land (recorded in test-specs §P2).
  Red-check (ground rule 1): flipped the cross-tenant GET expectation to 200 →
    the test FAILED (route really returns 404) → reverted. (Could not neuter the
    repo guard directly — the harness classifier blocks weakening prod access
    control, which is the correct posture; the assertion-flip proves liveness.)
  Tests: 204 server unit (unchanged) + 144 client + 26 integration (was 9, +17)
    green via `TEST_DATABASE_URL=... make test`.
  === HANDOFF: P2 REMAINING (next session) ===
  Item 1 (cross-tenant route matrix) DONE this session. Still TODO in P2, in order:
    2. Route-guard introspection test (middlewareCoverage.test.js): walk
       app._router.stack; assert every data route has authenticate +
       (requireFacilityAccess OR a documented repo-scoped-getter allowlist
       entry). NOTE decision needed: assessment/mitigation :id routes enforce
       facility at the REPO layer (getXForUser → null → 404), NOT via
       requireFacilityAccess middleware (facilityId isn't in the request
       pre-load). Plan: refine AGENTS.md invariant 1 wording + write a
       docs/decisions record for the repo-scoped-getter equivalent; name
       requireFacilityAccess's returned fn for detectability.
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase currently connects as owner/postgres → RLS bypassed).
       (a) migration creating policies keyed on a per-txn setting (SET LOCAL
       app.current_facility_ids / current_operator_id), (b) app wraps requests
       in a txn that SETs that context, (c) Supabase dashboard step to
       create+grant the non-owner role + point DATABASE_URL user at it →
       checkpoint with user. Test as the non-owner role via the harness.
    4. Reconcile AGENTS.md invariant 2 wording (demo gating driven by
       VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.
  Local test DB up: docker vantage-db (pgvector), database vorge_test. Re-run:
    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 (cont.): SQL-scoped assessment list + mitigations hardcode fix
  - assessmentRepository.listAssessmentsForUser: new facilityScopeFor(user,
    actingRole) builds facility_id/operator_id WHERE from the acting role's
    assignments (Author→own facilities; HQ→operator; cross-facility Admin→
    operator). Default-deny: empty scope returns [] with no query. Replaces
    fetch-all-then-filter-in-JS. Verified identical results to the old filter
    (integration tenantIsolation.repo.test.js still green).
  - mitigations/routes.js: replaced hardcoded hasFacilityAccess:true with
    canAccessFacility(...) on the loaded mitigation (2026-06-04 audit item).
  Tests: 204 server unit + 144 client + 9 integration green.
  === HANDOFF: P2 REMAINING (next session) ===
  Still TODO in P2, in order (see docs/test-specs.md §P2 + docs/roadmap.md):
    1. Cross-tenant ROUTE matrix (supertest + real DB): the penetration
       proof. Harness ready; need an auth helper that mints a real session
       (sessionService.issueSession {mfaSatisfied:true} → jwt.sign
       {email,actingRole,sid} sub=userId with env.jwtSecret) then supertest
       with Authorization: Bearer + X-Acting-Role. Assert cross-tenant GET
       :id → 404, POST workflow/log cross-tenant → 404, wrong-role → 403,
       unauthenticated → 401, list returns only own-tenant rows.
    2. Route-guard introspection test: walk app._router.stack; assert every
       data route has authenticate + (requireFacilityAccess OR a documented
       repo-scoped-getter allowlist entry). NOTE decision needed: assessment/
       mitigation :id routes enforce facility at the REPO layer (getXForUser
       → null → 404), NOT via requireFacilityAccess middleware (facilityId
       isn't in the request pre-load). Plan: refine AGENTS.md invariant 1
       wording + write a docs/decisions record for the repo-scoped-getter
       equivalent; name requireFacilityAccess's returned fn for detectability.
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase currently connects as owner/postgres → RLS bypassed).
       Requires (a) a migration creating policies keyed on a per-txn setting
       (SET LOCAL app.current_facility_ids / current_operator_id), (b) the app
       wrapping requests in a txn that SETs that context, (c) a Supabase
       dashboard step to create+grant the non-owner role and point the app's
       DATABASE_URL user at it. Likely needs a user dashboard action → plan to
       checkpoint before/after. Test as the non-owner role via the harness.
    4. HQ operator-portfolio scoping tests (§17.5) in the route matrix.
  Local test DB is up: docker pgvector db, database vorge_test. Re-run P2
    tests: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 START: integration harness + two-operator fixture + first isolation test
  Built the P2 foundation (docs/test-specs.md §P2 deliverable 0) against a
    REAL local Postgres (docker pgvector db, database vorge_test).
  Added:
    - server/jest.integration.config.js (separate from unit config).
      package.json: testPathIgnorePatterns adds /tests/integration/ so the
      default `npm test` stays DB-free + fast; new `test:integration` script.
    - tests/integration/requireTestDb.js (fail-loud if TEST_DATABASE_URL
      unset — verified it errors, never silently skips), env-setup.js (maps
      TEST_DATABASE_URL→DATABASE_URL, no SSL, NODE_ENV=test, before modules
      load), global-setup.js (knex migrate:latest on the test db).
    - tests/integration/fixtures.js: two operators × two facilities;
      Author+Reviewer per facility; HQ Exec/Approver/Mitigation Owner/
      cross-facility Admin per operator; one assessment per facility with
      asset/threat/link/evaluation/mitigation. Deterministic UUIDs.
      truncateAll + seedFixtures.
    - tests/integration/tenantIsolation.repo.test.js (9 cases): proves
      repo-layer isolation on real Postgres — Author sees only own facility;
      HQ sees own operator's facilities only; cross-facility Admin sees own
      operator only; getAssessmentForUser cross-tenant/sibling → null; scoped
      bundle returns only the target's rows.
    - scripts/test.sh: runs integration when TEST_DATABASE_URL set, else a
      prominent WARNING banner (deviation from spec's "make test fails loud",
      recorded in test-specs §P2 — keeps the DB-free unit loop usable while
      making a non-run impossible to miss).
  Local test DB setup (one-time): docker compose up -d db (pgvector/pgvector
    :pg16); CREATE DATABASE vorge_test TEMPLATE template0 (template0 avoids a
    harmless collation-version warning from the volume's old image).
  Tests: 204 server unit (unchanged) + 144 client + 9 integration, all green
    via `TEST_DATABASE_URL=... make test`.
  Next (P2 continued): route-guard introspection test → wire authenticate +
    requireFacilityAccess on data routes (or documented repo-scoped allowlist)
    → push listAssessments scoping into SQL → RLS migration + non-owner app
    role + policies → full cross-tenant route matrix → fix mitigations
    hasFacilityAccess:true hardcode. Checkpoint for review at phase end.

================================================================

2026-07-03 — P0 COMPLETE: staging cross-site smoke passed
  User finished all infrastructure.md dashboard steps. Verified staging
    end-to-end from the agent (no browser):
    - Render https://vorge-api-staging.onrender.com /health 200.
    - Vercel https://vorge-app.vercel.app 200.
    - Login (Author, no MFA) 200; CORS allow-origin=vercel app +
      allow-credentials=true; Set-Cookie vorge_refresh HttpOnly; Secure;
      SameSite=None (the P0 cookie fix, confirmed live).
    - GET /api/assessments with token+acting-role returns the 3 seeded
      assessments → Render→Supabase transaction pooler path works.
    - POST /api/auth/refresh with the cookie issues a new token →
      cross-site idle-refresh works.
  Not exercised: MFA enroll/verify browser flow (optional eyeball; all
    cross-origin plumbing it depends on is verified). P0 marked complete
    in roadmap + production-status.
  Interim posture noted: staging uses the Vercel URL; vorge.io per-client
    portal routing deferred (memory: vorge-io-portal-routing).
  Next: commit pending fixes (seed contributors JSONB + the two dotenv
    path bugs, with a test) then start P2 (tenant isolation) — harness first.

================================================================

2026-07-03 — P0 staging: migrate + seed against Supabase (vorge-staging)
  Ran migrations and seed against the real Supabase project from the
    developer machine (user had saved root .env, gitignored).
  Migrate: 7 migrations applied (initial schema + 5 auth-chunk migrations
    + 202607030001_enable_pgvector). pgvector extension confirmed enabled;
    22 public tables. Seed: 1 operator / 2 facilities / 6 users / 11 role
    assignments / 3 assessments / 2 assets / 2 threats / 2 mitigations.
  Two blockers fixed en route:
    - DNS: MIGRATE_DATABASE_URL pointed at the DIRECT host
      (db.<ref>.supabase.co) which has no A record here (IPv6-only) →
      ENOTFOUND. Switched MIGRATE_DATABASE_URL to the SESSION POOLER
      (pooler host, port 5432; IPv4). Runbook already anticipated this.
      Done in .env only (gitignored); backup in scratchpad.
    - Seed data bug (the known chunk-4 deferred item "assessments
      .contributors JSONB"): JS arrays passed to a jsonb column are
      serialized by node-pg as a Postgres array literal ({...}), which
      Postgres rejects as invalid JSON (22P02). Fixed by JSON.stringify()
      on all 3 contributors values in src/db/seed.js. Verified stored as
      real JSON arrays via jsonb_array_length. **UNCOMMITTED** — flagged
      for review (not committed; user hasn't asked to commit this pass).
  Latent bugs found (NOT fixed this pass — need their own change + test):
    - src/config/env.js loads dotenv with path "../../.env" (relative to
      cwd, not the file) → from server/ that resolves ABOVE the repo root
      and loads nothing; app/seed via `npm run` fell back to localhost DB.
      Worked around by preloading dotenv (node -r dotenv/config
      dotenv_config_path=../.env). Invisible in Docker/Render because env
      vars are injected directly. Recommend fixing the path + a test.
    - knexfile.js uses "../.env" (correct only because knex CLI runs with
      cwd=server/). Both paths are cwd-fragile; worth normalizing.
    - Root .env has duplicate NODE_ENV and DATABASE_URL keys (dev at top,
      staging appended at bottom); dotenv resolves last-wins so effective
      values are correct, but it is fragile — recommend de-duping.
  Secrets: local .env JWT_SECRET (was still the placeholder) + missing
    MFA_ENCRYPTION_KEY set to fresh random 32B values so the production
    boot guard passes for seed (local-only, never printed/committed).
    Separate fresh secrets generated + printed to the user for Render.
  Next (user): create Render (Docker, single instance, /health, envs incl.
    COOKIE_SAME_SITE=none + DATABASE_URL=transaction pooler:6543) and the
    new Vercel client project; then the §7 staging smoke.

================================================================

2026-07-03 — P0 infra grounding: code/config changes (Supabase/Render/cross-site ready)
  Follows same-day planning session (entry below; planning commit 9b57bf4).
  Shipped (server + infra config; NOT yet committed — stop-for-review):
    - server/knexfile.js: migrations prefer MIGRATE_DATABASE_URL (direct/
      session string for Supabase; the app's transaction-pooler string is
      unsuitable for migration locks); SSL { rejectUnauthorized: false }
      when NODE_ENV=production or DATABASE_SSL=true (CA pinning → P5).
      Knexfile is CLI-only; app/seed connect via src/db/knex.js.
    - server/src/db/knex.js: SSL via new env.databaseSsl (DATABASE_SSL,
      defaults ON in production, OFF elsewhere).
    - server/src/config/env.js: cookieSameSite (COOKIE_SAME_SITE, default
      "strict", lowercased) with boot guard — rejects non strict|lax|none
      and rejects none-without-Secure (browsers drop such cookies);
      databaseSsl as above.
    - Cookie fix (4 sites): refresh set/clear in modules/auth/routes.js +
      MFA-trust set/clear in services/mfaTrustDeviceService.js now use
      env.cookieSameSite instead of hardcoded "strict". NOTE: supersedes
      chunk-4 lockbox "SameSite=Strict locked" — cross-site Vercel client
      ↔ Render API requires None; default unchanged (strict) so local/
      same-site behaviour is identical. Docblock updated in the service.
    - server/migrations/202607030001_enable_pgvector.js: CREATE EXTENSION
      IF NOT EXISTS vector; warn-and-continue if the binary is absent
      (old local containers) — nothing consumes it until P4. down() no-op
      by design (dropping would destroy P4 vector data).
    - docker-compose.yml: db image postgres:16 → pgvector/pgvector:pg16
      (drop-in; same data volume). Recreate the db container to pick up.
    - NEW server/tests/envCookieSameSite.test.js (+9 tests) covering the
      COOKIE_SAME_SITE / DATABASE_SSL guards via jest.isolateModules.
  NOT changed by agent (human-review rule): .env.example — diff handed
    to user (MIGRATE_DATABASE_URL, COOKIE_SAME_SITE, DATABASE_SSL).
  docs/infrastructure.md updated to match implementation (seed needs
    DATABASE_URL + prod boot-guard secrets exported; migrate needs
    MIGRATE_DATABASE_URL; SSL automatic under NODE_ENV=production).
  Tests: 201 server (was 192, +9), 144 client, all green (make test).
  Committed: 4e7f932 (P0 code), after planning commit 9b57bf4.
  Addendum (same day, user directive): future phases will be executed by
    weaker models, so every phase now has a BINDING acceptance-test spec —
    NEW docs/test-specs.md (ground rules incl. red→green + two test layers;
    P2 integration harness + route-guard introspection + cross-tenant
    matrix + SQL-scoping + RLS-as-non-owner tests; P3 six-case minimum per
    endpoint + true-race lock_version + atomic audit + client 409 UX; P3.5
    docx golden-content; P4 mocked-gateway ceilings/audit/scoping + the
    aiImportBoundary scan test enforcing §9's no-direct-provider rule
    mechanically; P5 email loop/retention/Redis-swap/PII-scrub). Roadmap
    phases got DoD pointer lines; AGENTS.md invariant 3 now binds phase
    completion to test-specs (no ticking without green spec'd tests).
  Next: USER performs dashboard steps per docs/infrastructure.md §§1,4–7
    (Supabase project + pgvector, migrate+seed, Render service, new
    Vercel project); P0 exits on the §7 smoke. Then P2 (harness first).

================================================================

2026-07-03 — Production-push planning docs (P0–P5 roadmap, infra runbook, decisions)
  Planning-only session (no code). Locked decisions recorded: Supabase =
    managed Postgres only (custom JWT/bcrypt/MFA auth KEPT — no Supabase
    Auth); server = Render web service from server/Dockerfile (single
    instance; in-memory rate-limit/MFA caches); real client = NEW Vercel
    project (VITE_ENABLE_DEMO=false), vorge-demo-roles untouched; AI =
    Vercel AI Gateway + AI SDK behind an app-layer module.
  Files created:
    docs/roadmap.md — P0 infra / P1 auth-done / P2 tenant isolation /
      P3 write-section API / P4 AI / P5 hardening + dark-mode side-quest,
      PLUS "Suggested improvements & new features" review (per-area
      exists/partial/missing + prioritized suggestions, each tagged
      SCHEDULED / BACKLOG / NEEDS DECISION).
    docs/infrastructure.md — click-by-click runbook: Supabase project +
      pgvector + pooled(6543)/direct connection split, Render setup,
      second Vercel project, full env-var tables, migrate/seed steps.
    docs/decisions/2026-07-03-supabase-postgres-keep-custom-auth.md (LOCKED),
    docs/decisions/2026-07-03-ai-gateway-ai-sdk.md (§9 deviation —
      PENDING SIGN-OFF; businesslogic.md NOT edited),
    docs/decisions/2026-07-03-write-section-api.md (api-contract
      extension — PENDING SIGN-OFF; api-contract.md NOT edited).
  Files edited: AGENTS.md + CLAUDE.md (doc-update rule now includes
    ticking docs/roadmap.md on every meaningful change + before commits;
    current-focus → P0), docs/production-status.md (pointer to roadmap).
  Key findings baked into P0/P2 plans:
    - refresh + MFA-trust cookies hardcoded sameSite:"strict" → will
      silently break cross-site (Vercel↔Render); COOKIE_SAME_SITE env
      fix is a P0 item.
    - requireFacilityAccess middleware wired into ZERO routes; scoping
      lives only in repo-level canAccessFacility JS filters (listAssessments
      fetches ALL rows then filters in JS) — P2.
    - RLS ENABLEd since initial migration, zero policies; app DB role
      must be non-owner + SET LOCAL pattern for pooled conns — P2.
    - No write endpoints at all; no column for Section 1/2/8 text — P3.
  Tests: not run (docs only).
  Same-day approval: user signed off BOTH decisions (§9 AI deviation +
    write-section API), plus P3 scope additions (withdraw/recall +
    reassignment, mitigation assignment) and Word/PDF export pulled
    forward to P3.5. Records + roadmap updated to APPROVED/SCHEDULED.
  Next: commit planning docs, then P0 execution (knex SSL +
    MIGRATE_DATABASE_URL, pgvector migration, COOKIE_SAME_SITE fix,
    .env.example diff for human review) — agent code + user dashboard
    steps per docs/infrastructure.md. Stop for review at end of P0.

================================================================

2026-06-04 — Strategic roadmap created (docs/roadmap.md)
  [Editor's note, 2026-07-03 merge: the file below now lives at
   docs/strategic-roadmap.md — docs/roadmap.md was re-created that day
   as the production-push execution checklist. Findings folded into
   roadmap P2. Entry otherwise preserved verbatim.]
  Repo-wide retrospective audit synthesized into one living strategic
    roadmap. Read-only audit of client + server + migrations + tests
    against the canonical docs; no behavior changes.
  Shipped: docs/roadmap.md — 10 sections (exec snapshot, v1 DoD,
    themed retrospective, current-state matrix with evidence paths,
    Now/Next/Later/Deferred horizons, engineering enablers, mermaid
    dependency graph, open questions, feature-inventory appendix,
    maintenance instructions).
  Key audit findings (grounded in code, not docs):
    - P0 tenant isolation: requireFacilityAccess middleware EXISTS but
      is wired to NO data route (assessments/mitigations use only
      authenticate); scoping is JS filtering in repos
      (listAssessmentsForUser fetches ALL rows then .filter()s);
      mitigations route hardcodes hasFacilityAccess:true; RLS ENABLEd
      on 7 tables with ZERO policies (no-op under the postgres owner
      role); cross-tenant tests cover the AUTH domain only — data
      routes mock the repos so the filter is never exercised e2e.
    - Architecture truth: client is a fixtures prototype (only auth
      hits the API); server is real but partial (auth full + DB-backed;
      assessment/mitigation read+workflow DB-backed; NO content CRUD,
      audit-read, admin CRUD, exports, or AI service module).
    - Exports absent (no docx/pdf lib; alert() stubs). AI = AD-1 only
      plus stubs/heuristics. Dark mode ~52% (no prefers-color-scheme).
    - Demo gating uses VITE_ENABLE_DEMO, not import.meta.env.DEV as
      AGENTS.md invariant #2 states — flagged to reconcile.
  Also updated docs/production-status.md: added "See also:
    docs/roadmap.md" row to the Planning layers table; resolved the
    Exports row (To confirm -> Not started, evidence-backed); bumped
    Last updated to 2026-06-04.
  Tests: make test green (exit 0) — 192 server (13 suites; coverage
    99.82% stmts / 95.85% branch / 100% funcs+lines, 95% gate passes)
    + 144 client (10 files, 80% gate) = 336 passing.
  Next: finish dark mode; Phase 2 (route-level requireFacilityAccess,
    SQL repo scoping, cross-tenant data-route 403/404 tests).

================================================================

2026-06-02 — Rebrand: Vorge (full code + assets + docs)
  Trademark/identity conflict with a UK company → renamed Vantage to
    Vorge across the entire codebase. Same product, same lockup style;
    new wordmark and slightly lighter brand amber (#F4B860 vs #F49D0D).
  Scope: ~325 hits across ~80 files. Bulk sed (case-sensitive, both
    forms) across client/, server/, docs/, scripts/, .claude/hooks/,
    AGENTS.md, CLAUDE.md, README.md, SESSION_LOG.md, Makefile.
  Intentional kept-as-vantage items (3):
    - server DATABASE_URL default DB name → kept "vantage" (env.js +
      knexfile.js) so Docker/Postgres still works without recreating
      the database. docker-compose POSTGRES_DB and container names
      left untouched for the same reason.
    - .env.example untouched (human review per user instruction).
    - Drive .docx references in docs/ (Vantage_User_Flows.docx etc.)
      reverted post-sed — the actual Drive files have NOT been renamed,
      so the references must keep pointing at the real filenames.
  Logo / favicon:
    - Copied 2 new SVGs in from /Volumes/.../vorge logo/ → renamed to
      client/src/assets/vorge-logo-on-{light,dark}.svg.
    - Deleted old vantage-logo-on-{light,dark}.{svg,png}.
    - Created client/public/favicon.svg by viewBox-cropping the
      light SVG to 0 0 37 37 (mark only), linked in client/index.html.
  Storage keys (Q1 override = migration shim, NOT hard cut):
    - New central client/src/config/storageKeys.js with all keys.
    - client/src/config/legacyStorageMigration.js — one-shot, idempotent,
      best-effort. Called from main.jsx before React mounts.
    - Migrates: vantage.session, vantage.session.token, vantage-theme,
      vantage:demo:mobile-gate-dismissed, vantage:op:* → vorge.* counterparts.
    - 5 new vitest cases in legacyStorageMigration.test.js.
    - Existing consumers (AuthContext, useTheme, useOperatorMemory,
      computeInitialDismissed, MfaEnrollPage) now import from the
      central file.
  Server cookies (one release window dual-read):
    - env.js: added legacyRefreshCookieName ("vantage_refresh") and
      legacyMfaTrustCookieName ("vantage_mfa_trust"). Writes/clears
      use the new names; reads fall back to legacy if new absent.
    - 4 read sites updated: 3 in modules/auth/routes.js, 1 in
      services/mfaTrustDeviceService.js. Drop after one release.
  CTA cohesion (Q2 default): LoginPage dark-mode Sign-in button
    dark:bg-[#F49D0D] → #F4B860 to match the new brand mark. Hover
    stays #FFB020. Both Demo + Prod login variants.
  Tests: 144 client passing (was 139 — +5 migration tests), 192 server
    passing (unchanged). Client build clean.
  Deferred (Q3 + infra): website/ (gitignored homepage generator,
    62 hits) and Drive .docx renames — separate user-controlled work.
    GitHub repo, Vercel project name, local directory rename are
    user UI/CLI work outside any commit. All logged in
    considered-and-deferred.md.
  Next: commit + push (per overrides); do NOT vercel --prod unless
    user asks.

================================================================

2026-06-01 — Demo facility rename (de-identification)
  Three mock facilities reused names of real refineries/terminals.
    Renamed for de-identification:
      Lagos Refinery         → Eko Petrochemical Hub
      Bonny Terminal         → Delta Crest Terminal
      Fujairah Marine Terminal → Gulf Horizon Terminal
    "Eko" is Yoruba for the Lagos area; the others are fully fictional.
  Approach: literal-text sed across client/src/{**/*.js,**/*.jsx} +
    one manual update to the case-insensitive regex in
    AuthorDashboard.test.jsx (findLagosRow → findEkoRow; /lagos refinery/i
    → /eko petrochemical hub/i ×2). Replaced FULL multi-word names only
    — no collisions, no accidental matches in identifiers.
  Scope: 94 occurrences across 16 files (client/src ONLY — server/docs
    clean). Source-of-truth: auth/session.js (DEMO_FACILITY,
    DEMO_SESSION.facilities) + data/operators.js (FACILITIES, prod-shape).
    Derived strings cascaded: data/{auditLog,notifications,assessments,
    admin,mitigations}.js (33+11+9+9+6=68 hits), the assessment-name
    suffixes (e.g. "Lagos Refinery — 2026 SRA" → "Eko Petrochemical Hub
    — 2026 SRA"), plus dashboard, modal, and section display strings.
  Defaults accepted (Q1–Q3 from plan):
    - Q1 KEEP region strings ("Lagos, Nigeria" etc.) and regulator
      strings — geographic verisimilitude consistent with "Eko" = Lagos.
    - Q2 LEAVE accountableManager names (Daniel Mensah, Hassan
      Al-Mansoori, Nadia Haddad) — geographically consistent with Q1.
    - Q3 LEAVE fac-4 Pernis Refinery Complex + fac-5 Jurong Storage
      Terminal — also real-place names but you scoped to 3 facilities;
      logged in considered-and-deferred for a follow-up.
  Key files: 15 modified via sed + AuthorDashboard.test.jsx via Edit.
  Tests: 139 client passing (unchanged — data rename, no behaviour).
    Build clean.
  Decision record: product-decision-log.md narrative entry (defect-fix
    tone). Deferred: Pernis + Jurong rename, full region/regulator
    anonymization — both in considered-and-deferred.md.
  Next: commit + push (per standing prefs); deploy at user's call.

================================================================

2026-05-29 — AD-1: anomaly acknowledgement on Section 3 assets
  Spec (businesslogic §9.2) defines real-time anomaly detection as a paid
    recurring add-on with a flag → acknowledge (4 reasons) → audit loop.
    Demo had only the rule (detectAssetAnomaly) rendered as a passive
    amber note — no acknowledge loop. AD-1 adds the Author-facing loop
    (the demo-sellable mechanic); backend engine/debounce/other sections
    deferred to AD-2+.
  Shipped (client-only, advisory — never blocks workflow):
    - useAnomalyAcknowledgement hook: rule call + per-Author validity via
      a criticality/consequences SNAPSHOT (editing either field auto-
      invalidates the ack and re-fires the warning; no explicit clear).
      Rule id "asset-criticality-consequences"; keyed by session.user.id.
    - AnomalyWarningChip (tokens only — semantic-warning + text-*; no new
      zinc): warning state with Acknowledge button; muted "acknowledged
      — {reason}" state after dismissal (kept visible for transparency).
    - AnomalyAcknowledgeModal: reuses shared (tokenized) Modal; reasons
      Not applicable / False positive / Will address / Other (note
      required iff Other).
    - WorkspaceContext.acknowledgeAnomaly: writes the ack snapshot onto
      the asset + appends an "anomaly-ack" audit entry atomically (mirrors
      addComment). Lowercase-hyphen action, matching existing vocab.
    - Wired into AssetDisaggregationSection (ExpandedAssetRow); Acknowledge
      hidden when readOnly (non-Author or non-Draft).
  Defaults accepted (Q1–Q3): per-Author key on the asset (demo assets are
    workspace-global, so "per-assessment" is approximated — v1 limitation);
    soften (not hide) acknowledged chip; lowercase "anomaly-ack" audit.
  Key files: client/src/components/AnomalyWarningChip.jsx;
    client/src/features/assessmentWorkspace/{useAnomalyAcknowledgement.js,
    AnomalyAcknowledgeModal.jsx}; edits to AssetDisaggregationSection.jsx
    + WorkspaceContext.jsx. Tests: client/src/data/assets.test.js (7) +
    AssetDisaggregationSection.test.jsx (2 RTL).
  Tests: 139 client passing (was 130 — +9). Build clean.
  Decision record: product-decision-log.md AD-1 entry (incl. AD-1→AD-4
    arc table). Advisory-only — does not gate submit/review/approve.
  Deferred (handoff): AD-2 (Sections 5/6 + server engine/debounce),
    AD-3 (admin dismissal-rate tuning), AD-4 (cross-facility); admin
    enable toggle (none wired today — always-on for demo).
  Next: commit (done); push is user's call.

================================================================

2026-05-29 — LoginPage dark-mode brand contrast + real logo
  QA: in dark mode the Vorge wordmark, "Sign in to continue" heading,
    and primary Sign-in button were all brand-navy on near-navy bg —
    low contrast, weak brand, unclear CTA. Placeholder Lucide shield
    still in use instead of a real logo.
  Key finding (changed the approach): the repo ALREADY had designer-made
    theme-correct logo SVGs in client/src/assets/ —
    vorge-logo-on-light.svg (black wordmark) + vorge-logo-on-dark.svg
    (white wordmark), added 2026-05-12, never wired into LoginPage. So
    the planned JPEG processing (crop mark / strip white bg) was
    unnecessary; the provided PNG is superseded.
  Shipped (Option 3 — gold CTA + lighter-navy heading):
    - Brand lockup: replaced Lucide shield + "Vorge" text with the
      existing SVGs, swapped by theme (block dark:hidden / hidden
      dark:block), h-8. "SRA Platform" stays token text. Applied to BOTH
      DemoLoginPage and ProdLoginPage lockups.
    - Heading: + dark:text-primary-300 (#7B99B3 lighter navy).
    - Sign-in button: dark-mode brand-amber #F49D0D bg + dark-navy text
      (#070E16) + #FFB020 hover + transparent border. Brand gold matches
      the logo square. LOCAL dark: utility (not a token) to keep the
      gold CTA scoped to LoginPage — a global token would leak it to
      every primary button.
  Decisions: white wordmark (designer asset as-is, not recoloured);
    gold = brand-mark amber over semantic-warning/lighter-amber; no new
    design tokens (Tailwind dark: + existing primary ramp).
  Key files: client/src/pages/auth/LoginPage.jsx;
    client/src/assets/vorge-logo-on-{light,dark}.svg (existing, wired).
  Tests: 130 client passing (unchanged — visual-only). Build clean.
  Visual QA: NOT human-verified in this env (static change). Needs a
    desktop+mobile light/dark eyeball before relying on it.
  Decision records: product-decision-log.md (structured entry) +
    considered-and-deferred.md (gold-CTA-app-wide; mark-only asset).
  Deferred: gold CTA app-wide + promote #F49D0D to an action token;
    mark-only logo asset for compact contexts.
  Next: commit + push; deploy is user's call after visual verification.

================================================================

2026-05-29 — Fix: tokenize auth-page bg-white surfaces (dark-mode contrast)
  QA (real phone, dark mode) surfaced unreadable text in the LoginPage
    demo role-picker modal right after the zinc migration (a05da19).
  Root cause: the migration tokenized the text (text-text-primary etc.,
    which flip light in dark mode) but left the co-located surfaces as
    hardcoded bg-white (never themes). Result in dark mode: light text
    on a white card = unreadable. A half-migrated surface — the exact
    risk the scoping report flagged. NOT a missed zinc class (zinc sweep
    was clean) and NOT viewport-driven: the modal has zero responsive
    prefixes. The "mobile only" symptom was per-device localStorage —
    that phone had vorge-theme=dark stored from a prior logged-in
    session; the app still doesn't honor prefers-color-scheme, so dark
    mode on /login is localStorage-driven.
  Fix: migrated all 6 bg-white in auth pages to surface tokens —
    LoginPage role-picker modal → bg-surface-overlay (dialog-over-scrim
    elevation), LoginPage demo-bypass button + MfaEnroll QR/recovery
    boxes + MfaSettings 2 sections → bg-surface-raised. All surface
    tokens are #FFFFFF in light (zero light-mode change) and dark
    grays in dark mode (readable with the light text tokens).
  Scope: stayed entirely in auth-page files (no shared components /
    Chunk B). Completes the auth-page surface migration left half-done
    by the zinc-only sweep.
  Note/assumption: MfaEnroll QR box is now a dark surface in dark mode;
    the QR PNG carries its own white background so it stays scannable
    (the dark box is only the padding ring). Verify if real-auth MFA
    enroll is ever exercised in dark mode.
  Key files: LoginPage.jsx, MfaEnrollPage.jsx, MfaSettingsPage.jsx.
  Tests: 130 client passing (unchanged — visual-only). Build clean.
  Only zinc left in auth: LoginPage:179 modal scrim (deferred by
    decision; theme-agnostic).

================================================================

2026-05-29 — Doc catch-up + dark-mode Chunk A (auth pages)
  Catch-up (closing a grounding gap — SESSION_LOG was one beat behind):
    - 2026-05-28/29 doc setup landed: docs/production-status.md created
      (the living map; SESSION_LOG stays the diary), CLAUDE.md replaced
      + line-11 typo fixed, AGENTS.md updated (Phase 1 ✅ / Phase 2 ⬅,
      doc-update bullet under "Before committing"), .claude/hooks/
      pre-commit.js extended with a non-blocking doc-update WARNING.
      Commits 85105a7, 4c6334c (pushed).
    - Dark-mode Chunk A was attempted on 2026-05-28 then reverted before
      review (no shipped code; working tree returned to 5bbf903). The
      plan file ~/.claude/plans/vorge-phase-1-pure-kernighan.md remains
      valid as the forward plan.
    - Parked, still open: critical-severity dark text awaiting designer
      sign-off (#FF5C61, already AA-passing — non-code blocker); Vercel
      "not a member of the team" deploy email — watching for recurrence.
  Chunk A landed (this session): zinc→token migration on the 7 auth
    pages (LoginPage, ForgotPassword, ResetPassword, MfaVerify,
    MfaEnroll, MfaLockout, MfaSettings). Narrow scope by decision —
    toggle-on-auth and prefers-color-scheme split out to future chunks
    (last night's bundling caused complication).
    Mapping: text-zinc-900/700→text-text-primary, 500→text-text-muted,
    400→text-text-disabled; border-zinc-200→border-border-default,
    300→border-border-strong; bg-zinc-200(dividers)→bg-border-default,
    bg-zinc-50→bg-surface-sunken, hover:bg-zinc-100→hover:bg-surface-muted.
    Left literal by decision: LoginPage role-picker modal scrim
    bg-zinc-900/30 (theme-agnostic dark overlay; no --scrim token, and
    surface-inverse would flip white in dark). bg-white untouched
    (not a zinc class; separate dark-mode gap).
  Key files: client/src/pages/auth/*.jsx (7 files).
  Tests: 130 client passing (unchanged — migration is visual-only, no
    class assertions). Production build clean.
  Visual: not human-verified in this environment. Light mode now uses
    the brand gray ramp (cool/navy-tinted) instead of Tailwind warm
    zinc — a subtle intended hue correction, not a regression. Dark
    mode on auth pages still won't activate pre-login until the toggle
    + prefers-color-scheme chunk ships (accepted for this chunk).
  Commits: 0a61faa (Task 1 catch-up) + this one (auth migration).

================================================================

2026-05-28 — Section 6 validation: human labels instead of raw eval IDs
  Phone QA surfaced: Section 6 validation banner read
    "Evaluation e-at-t5-1779934620202 is missing the risk scenario."
    — leaking the raw DB id to the user with no way to map it to a
    matrix cell. Section 6 was the only section with this gap;
    Section 3 (assets), Section 4 (threats), and Section 7 (mitigations)
    all already used human-readable labels.
  Fix: added evaluationLabel() in sectionValidation.js, mirroring the
    existing mitigationLabel() pattern in the same file. Resolves
    (assetId, threatId) to "the Asset N × <Threat> evaluation" via
    asset.name + threat.short/classification/name lookups with
    graceful fallbacks. Eval id is never used in user-visible text.
  New messages:
    - "The Asset 1 × Terrorism evaluation is missing the risk scenario."
    - "The Asset 1 × Terrorism evaluation has no R1 score."
  Codes unchanged (eval-scenario, eval-r1) so existing code-based
    consumers and tests still work.
  Files modified: client/src/features/assessmentWorkspace/sectionValidation.js
    (~15 lines added/changed), client/src/features/client.test.jsx
    (2 new test cases).
  Tests: 130 client passing (was 128 — +2 new). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → narrative entry
      "Section 6 validation messages use human labels". Captures
      symptom, root cause, fix, and the deferred follow-up.
  Followup deferred:
    - Deep-link errors to the offending matrix cell. Bigger refactor;
      threads richer error objects through ValidationSummary.jsx.
      Natural next step.
  Next: vercel --prod when user authorizes; re-verify on-device.
  Auth note (observed, not blocking): Received Vercel email at 02:25
    BST flagging a failed CLI deployment from GitHub identity
    279891108+Alora-ops@users.noreply.github.com to alora-ops projects
    ("not a member of the team"). Did not block the actual deploys,
    which succeeded under the alora-ops CLI session. Cause unclear —
    possibly a separate auth context (Claude Code's environment, stale
    GitHub Actions token, or a transient identity mismatch). Recorded
    for pattern-spotting; if recurs on future deploys, investigate
    auth setup.

================================================================

2026-05-28 — Author dashboard: whole-row tap target + per-mode landing
  Phone QA on live demo surfaced: Lagos Refinery row opens fine via
    desktop mouse click but ignores phone taps. Inspection: the <tr>
    had no onClick; the only interactive element was a tiny text-link
    button (text-[13px], no padding, hit-box ~15px tall) well below
    iOS's 44px touch-target minimum. Mouse precision-hit; finger taps
    missed.
  Fix shape: make the whole <tr> clickable (role="button", tabIndex=0,
    aria-label per assessment, Enter/Space keyboard handlers,
    cursor-pointer, focus-ring). Inner "Open →" button kept as visible
    affordance, with event.stopPropagation() so a button click doesn't
    double-navigate via the row.
  Product decision baked in: landing section now branches by demo flag.
    Production navigates to /sections/2 (Facility Info — current
    behaviour preserved exactly). Demo navigates to /sections/1
    (Executive Summary — natural reading order for cold prospects).
    Single openAssessment helper inside the row map keeps both
    handlers anchored to one source of truth.
  Files modified: client/src/pages/dashboards/AuthorDashboard.jsx
    (1 import, ~20 lines around the row block).
  Files added: client/src/pages/dashboards/AuthorDashboard.test.jsx
    (6 cases: demo-on click, demo-off click, button stopPropagation,
    Enter, Space-preventDefault, a11y attrs).
  Tests: 128 client passing (was 122 — +6 new). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → formal structured entry
      "Author dashboard — whole-row tap target + per-mode landing
      section". Captures touch-target rationale, demo vs prod audience
      reasoning, open question about last-viewed-section resume, and
      the deferred follow-up for Reviewer / Approver / HQ Executive /
      Mitigation Owner dashboards.
  Followup deferred:
    - Same small-target pattern likely lives on the other three
      dashboards. Flagged in product-decision-log; not in this chunk.
    - Should production Authors resume at last-viewed section instead
      of hardcoded section 2? Open question, deferred.
  Next: vercel --prod, real-device tap smoke at <1024px.

================================================================

2026-05-28 — Demo mobile-warning gate (Phase 1 POC)
  New component: DemoMobileGate wraps the app above the router.
    Fires only when isDemoEnabled() AND innerWidth < 1024 AND
    sessionStorage key absent. Soft warning, "Continue anyway" CTA,
    Esc-dismissible, role="alertdialog", aria-labelledby on heading,
    autofocus on button.
  Files added: client/src/components/demo/{DemoMobileGate.jsx,
    computeInitialDismissed.js, DemoMobileGate.test.jsx}
  Files modified: client/src/App.jsx (wrap AuthProvider subtree)
  Brief deviations surfaced:
    - Used isDemoEnabled() helper instead of inlining import.meta.env
      check (matches 9+ existing call sites).
    - Brand subhead "SRA Platform" uses text-text-muted token, not
      LoginPage's legacy hardcoded text-zinc-500. Reconciles "match
      sign-in" with "no zinc hardcodes" — copy lockup structure, route
      token-able text through design system.
    - Extracted computeInitialDismissed as a pure helper for clean
      SSR-branch unit testing (dependency-injected via property-existence
      checks, not destructuring defaults — explicit-undefined matters).
    - aria-labelledby on visible heading id instead of aria-label.
  Tests: 122 client passing (was 106 — +16 new gate tests, plus
    pre-existing suite). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → formal structured entry
      "Demo-mode mobile viewport gate" (threshold 1024, sessionStorage,
      check-on-mount).
    - docs/considered-and-deferred.md → "Full mobile responsive build
      for demo" with revisit conditions tied to Field mode M4-M5,
      prospect ask, or observed funnel drop-off.
  Followup deferred:
    - LoginPage.jsx "SRA Platform" subhead still hardcodes text-zinc-500
      (dark-mode gap, separate fix).
    - Update Vantage_Vercel_Deployment_Guide.docx "Before the meeting"
      checklist to mention phone-check + gate (separate Drive doc chunk).
  Next: visual QA at 320/375/414/768/1023/1024 in DevTools + real-device
    smoke after vercel --prod.
  Deploy recovery: bb65bb2 needed a manual vercel --prod and didn't
    auto-promote on the first try. CLI 53.1.0 produced an orphaned
    UNKNOWN-status deploy dpl_3KUqcMCrAF47k6dYfiNRwoTmFSHG (no build
    logs, never aliased — left in place). Upgraded CLI to 54.5.1 (sudo
    npm i -g vercel@latest), re-ran vercel --prod, succeeded. New live
    deploy: dpl_HCDHMK9HaxgJAxMqbnajukSC5AXd. Alias verified pointing
    to new ID; bundle grep on /assets/index-CySC5ygM.js confirms 5/5
    gate string literals present. Parked observation about system-wide
    Node + sudo recorded in docs/considered-and-deferred.md.

================================================================

2026-05-28 — Manual Vercel deploy setup for vorge-demo-roles
  Vercel CLI installed and authenticated (alora-ops account)
  Project linked: alora-ops-projects/vorge-demo-roles
  .vercel/ folder in repo root (gitignored, per-machine config)
  Env var set: VITE_ENABLE_DEMO=true on production scope
  Build settings fixed: Root Directory = client, Framework = Vite
  First successful deploy: db1ac21 main HEAD → vorge-demo-roles.vercel.app
  Deploy ID: dpl_5abKiN4Nn9BGgYDubxvxhkngfgMi
  Pattern established: vercel --prod from repo root deploys current main HEAD to demo URL. No git auto-deploy (intentional — git integration in dashboard remains disconnected).
  Next: mobile-readable warning for demo (Level 1 only)

================================================================

2026-05-28 — Dark mode contrast fix for AssessmentShell active rail item
  Branch merged to main: fix/dark-mode-assessment-rail-contrast
  Fix commit: 911370d
  Merge commit: 8063b2b
  Scope: 3 className edits in AssessmentShell.jsx + 1 deferral entry
    in considered-and-deferred.md
  Trigger: Tailwind opacity-modifier fix (e901317) restored
    dark:bg-primary-900/40 which exposed text-primary resolves to
    same mid-navy in both light/dark modes
  Tests: 106 passing (unchanged). Build clean. CSS bundle +570 bytes.
  Visual QA: confirmed in dark mode at Section 8 view; active rail
    item text readable, number circle digit readable, comment badges
    sitting cleanly
  Captured during QA: section completion state question (when does
    section get green check?) → docs/considered-and-deferred.md
  Followup deferred: red error-count badge (line 74) has same
    structural issue — out of scope this round
  Next: Phase 2 tisolation (new session)

================================================================

2026-05-27 — Dark mode severity ramp locked + tension resolutions
  Branch on origin: feat/dark-mode-spec-refresh
  Commit: <sha after push>
  Tests: 192 server, 102 client, all passing (no behavioral change)
  Lockbox: n/a (CSS tokens + product-decision-log entries)
  Severity ramp:
    - 4 of 5 severity values landed from designer's signed-off spec
      (Low/Med/High/Very High)
    - Critical text overridden from designer's #E23339 to #FF5C61:
      original calculated 4.18:1 on #2B0809 (fails WCAG AA),
      override calculates ~5.5:1 (passes)
    - Designer notified; awaiting confirmation or replacement shade
    - TEMP marker removed; severity tokens now production
  Also in this commit:
    - Secondary mid-tones S-200/300/400 aligned to spec
    - Added --border-primary token (light: primary-200, dark:
      primary-600); refactored 0 consumers (no components use
      --surface-primary today; token is future-facing)
  Tension resolutions (designer notified as FYI, not asking for input):
    - Gold reserved for identity only — logo, sparkle marker,
      selective accent pills. NOT a button color. The amber "CTA
      button" in her preview was template residue from a different
      project.
    - Tertiary teal (T-400 family) reserved exclusively for AI
      affordances. Removed "Success/Progress" label from T-400 usage
      docs. Success uses semantic green (#4ADE80), progress uses sage
      (severity-low). No role overlap.
  Decisions logged: docs/decisions/product-decision-log.md (2 new
    entries for the tension resolutions)
  Smoke: dark-mode pages will be eyeballed before merge
  Next: visual QA in browser, then merge to main

================================================================

2026-05-27 — Merged chunks 0-4 + cleanup + docs into main
  Merge commits: 096c014 (chunks 0-4 + cleanup), 43332e6 (docs)
  origin/main now current with all auth work and decision records
  Branches preserved on origin as historical reference (not deleted)
  All 7 forensic tags on origin: pre-env-gating, pre-auth-logout,
    pre-refresh-tokens, pre-password-reset, pre-cleanup-user-agent,
    pre-mfa-enforcement, pre-production-push
  Vercel: deployment will auto-update if connected (demo mode
    preserved via VITE_ENABLE_DEMO=true env var)
  Next: chunk 5 (TBD) — branch off updated main this time
  
================================================================

# Vorge Build — Session Log

Append entries at the end of every working session. Newest at top.

Entry format:
YYYY-MM-DD — <short label>
  Branch(es)/commit(s) on origin: <list>
  Tests: <server count> server, <client count> client, status
  Lockbox(es): <paths if any>
  Smoke: <result>
  Next: <what's next>
  Deferred: <items pushed to later milestones>

================================================================

2026-05-27 — Decision records and session continuity practice established
  Branch on origin: docs/decision-records-setup
  No code changes; documentation only.
  Files created:
    docs/decisions/HISTORICAL_CONTEXT.md — pointer to pre-chunk-4
      Drive docs at Backup/Business/Security Risk/
    docs/decisions/product-decision-log.md — running product
      decisions, pre-populated with 7 chunk-4 entries
    docs/considered-and-deferred.md — parked items with revisit
      conditions, pre-populated with 13 entries from chunks 1-4
    docs/marketing-positioning-pointer.md — signposts customer-facing
      language decisions back to Drive
    Notes.txt (this file) at repo root
  Next: chunk 5 (TBD — confirm against master plan)
  Note: chunk-4 lockbox at docs/decisions/chunk-4-mfa.md continues
    in place. This setup commit complements it for cross-chunk and
    product records going forward.

================================================================

2026-05-27 — Chunk 4 MFA enforcement shipped
  Branches on origin: cleanup/audit-strip-user-agent (a28c7f0),
    feature/auth-mfa (commits 85a8b71 pre-code artifacts + f1c477c
    MFA implementation)
  Forensic tags pushed: pre-cleanup-user-agent, pre-mfa-enforcement
  Tests: server 192, client 102, all green
  Lockbox: docs/decisions/chunk-4-mfa.md
  UI checklist: docs/decisions/chunk-4-ui-checklist.md
  Smoke: all 5 scenarios passed (verify, /settings/mfa, trust-device
    end-to-end, demo mode clean, rollback flag works and reverts)
  PRs: NOT opened (consistent with chunks 1-3 workflow)
  Followups deferred: per-facility MFA policy editor, configurable
    lockout thresholds, Author/Reviewer MFA reinstatement decision,
    full RLS on MFA tables, Redis migration for rate-limit + replay
    cache (required pre multi-instance), audit_log_entries naming in
    lockbox §NEW-4, seed bug for assessments.contributors JSONB.
  Next: chunk 5 (TBD — confirm against master plan)

================================================================

2026-05-?? — Chunk 3 password reset shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-password-reset (509c939)
  Forensic tag: pre-password-reset (221fd5a)
  Commit subject: "Password reset: forgot/reset flow with stubbed
    email delivery"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 2 refresh tokens shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-refresh-tokens (68a12bc)
  Forensic tag: pre-refresh-tokens
  Commit subject: "Refresh tokens: rotating httpOnly cookie + family
    revocation"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 1 session revocation shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-logout-sessions (221fd5a)
  Forensic tag: pre-auth-logout
  Commit subject: "Server-side session revocation: sessions table,
    sid claim, /logout"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 0 env-gating shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/env-gating (1d2d632)
  Forensic tag: pre-env-gating
  Commit subject: "Env-gate demo personas; wire real login through
    /api/auth/login"
  No lockbox (pre-lockbox pattern)
