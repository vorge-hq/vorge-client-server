# Production Roadmap — Living Checklist

> **Current phase: P2 — Tenant isolation ✅ COMPLETE 2026-07-03; P3 write/section API next (paused for user go-ahead). P0 infra grounding COMPLETE 2026-07-03** (Supabase + Render `vorge-api-staging` + Vercel `vorge-app`, cross-site smoke passed). Locked decisions: Supabase = managed Postgres only (keep custom JWT/bcrypt/MFA auth); server = Render web service from `server/Dockerfile` (single instance — in-memory rate-limit/MFA caches); real client = NEW Vercel project (`VITE_ENABLE_DEMO=false`), demo project `vorge-demo-roles` untouched; AI = Vercel AI Gateway + AI SDK behind an app-layer module (§9 deviation SIGNED OFF 2026-07-03; write/section API contract extension SIGNED OFF 2026-07-03 — see `docs/decisions/2026-07-03-*`). Do not push past a phase without user review.

**How this file relates to the others:** `docs/production-status.md` is the product-state map; `docs/strategic-roadmap.md` is the evidence-backed retrospective/synthesis (audited 2026-06-04); this file is the production-push execution checklist. Tick boxes here (and append `SESSION_LOG.md`) on every meaningful change and before any commit touching `client/src/`, `server/src/`, or `server/migrations/`. Phase mapping to the old AGENTS.md numbering: old Phase 1 = P1 (done), old Phase 2 = P2, old Phase 3 ≈ P0 + P5.

**Standing rules for every phase:** `make test` before every commit; 95% server-service coverage gate stays; never commit `.env` (check `git status`); fresh prod secrets via `openssl rand -base64 32`; no sign-ups/deploys/spend by the agent — dashboard steps are handed to the user (see `docs/infrastructure.md`); `docs/businesslogic.md` and `docs/api-contract.md` are not edited — deviations go in `docs/decisions/`.

**Definition of done — tests are the gate:** every phase has a binding acceptance-test spec in **`docs/test-specs.md`**. A checklist item below may only be ticked when its spec'd tests exist, run inside `make test`, and pass. Read the spec's ground rules before writing any phase code.

---

## P0 — Infra grounding ✅ COMPLETE (2026-07-03)

Outcome: a real staging environment (Supabase DB + Render API + non-demo Vercel client), not fixtures.

Code/config changes (agent) — **landed 2026-07-03** (201 server / 144 client tests green):
- [x] Knex SSL + connection split: `knexfile.js` (migrations) prefers `MIGRATE_DATABASE_URL`, SSL in production or with `DATABASE_SSL=true`; app knex (`src/db/knex.js`) SSL via `DATABASE_SSL` (default on in production).
- [x] Migration `202607030001_enable_pgvector.js` (`CREATE EXTENSION IF NOT EXISTS vector`, warn-and-continue where binary absent); docker-compose db image → `pgvector/pgvector:pg16` (recreate local db container to pick it up).
- [x] Cookie cross-site fix: `COOKIE_SAME_SITE` env (default `strict`; boot guard rejects invalid values and `none` without Secure) now drives refresh + MFA-trust cookies (4 sites). Chunk-4 "SameSite locked to Strict" superseded — noted in the service docblock + SESSION_LOG. +9 env-guard tests.
- [x] `CORS_ORIGIN` verified: single exact origin supported and sufficient (prod domain only; preview URLs deferred).
- [x] Env examples: `.env.example` diff handed to user for human review (AGENTS.md rule — file not edited by agent).
- [x] Client prod env shape documented in `docs/infrastructure.md` §3/§6.

Manual dashboard steps (user — click-by-click in `docs/infrastructure.md`) — **DONE 2026-07-03**:
- [x] Supabase project `vorge-staging`; migrate (session pooler :5432) + seed; `vector` enabled; 22 tables.
- [x] Render web service `vorge-api-staging.onrender.com` (Docker, single instance, `/health` 200, `COOKIE_SAME_SITE=none`, DATABASE_URL = transaction pooler :6543).
- [x] Vercel client `vorge-app.vercel.app` (`VITE_ENABLE_DEMO=false`, `VITE_API_BASE_URL` → Render).
- [x] Smoke PASSED: login 200 + CORS(allow-origin+credentials) + refresh cookie `HttpOnly; Secure; SameSite=None` + `GET /api/assessments` returns 3 seeded rows (Render→Supabase pooler) + cookie-refresh issues a new token. Optional remaining: MFA enroll/verify browser eyeball (non-blocking; API plumbing verified).

**P0 COMPLETE 2026-07-03.** Interim posture: staging on Vercel URL (custom domains / vorge.io per-client portal routing deferred — see memory `vorge-io-portal-routing`).

## P1 — Auth ✅ done (record only)

Login → JWT → refresh (rotating httpOnly cookie + family revocation), session revocation/logout, password reset (email delivery stubbed — wired in P5), TOTP MFA + enforcement + trusted devices, demo personas env-gated. Chunks 0–4; records in `SESSION_LOG.md`, git tags, `docs/decisions/chunk-4-mfa.md`.

## P2 — Tenant isolation (P0 security — must land before real customer data) ✅ COMPLETE (2026-07-03)

DoD: `docs/test-specs.md` §P2 — integration harness (real Postgres, fail-loud without `TEST_DATABASE_URL`), route-guard introspection test, cross-tenant matrix, repo SQL-scoping assertions, RLS tests as the non-owner app role.

- [x] Build the integration-test harness + two-operator fixture (test-specs §P2 deliverable 0) — **DONE 2026-07-03**: `jest.integration.config.js` + `tests/integration/*`, fail-loud on missing `TEST_DATABASE_URL`, `npm run test:integration`. First test `tenantIsolation.repo.test.js` (9 cases) proves repo-layer isolation against real Postgres (Author/HQ/Admin scoping; cross-tenant get→null; scoped bundle). Local test DB: `vorge_test` on the docker pgvector db.
- [x] Route-guard introspection test (test-specs §P2 deliverable 1) — **DONE 2026-07-03**: `server/tests/middlewareCoverage.test.js` (18 cases, unit loop — no DB, so it gates every commit) walks `app._router.stack` and asserts every data route has `authenticate` + (`requireFacilityAccess` OR a documented in-test repo-scoped-getter allowlist entry). Structural guards: unclassified `/api` mounts fail, stale allowlist entries fail. `requireFacilityAccess` returns a named fn (`requireFacilityAccessMiddleware`) for detectability. Repo-scoped-getter equivalence recorded in `docs/decisions/2026-07-03-repo-scoped-facility-access.md`; AGENTS.md invariant 1 reworded to accept both guards. Red-checked (dropped-exemption, stale-entry, unclassified-mount all fail as expected).
- [x] Isolation guard on every data route (2026-07-03): resolved by the two-guard decision (`docs/decisions/2026-07-03-repo-scoped-facility-access.md`) — by-id routes enforce facility at the repo layer (user-scoped getter → 404), which is the `requireFacilityAccess` equivalent for routes with no facility in the payload; `requireFacilityAccess` middleware stays the required shape for P3 write endpoints whose payloads carry `facilityId`. Enforced by the deliverable-1 introspection test above.
- [x] `listAssessmentsForUser` scoping pushed into SQL (2026-07-03): `facilityScopeFor` builds facility/operator WHERE from the acting role's assignments; default-deny (empty → `[]`). Identical results to the old JS filter (integration test still green). Other repo queries still to audit.
- [x] Fixed the `mitigations` route `hasFacilityAccess: true` hardcode (2026-07-03) — now derived from `canAccessFacility` on the loaded mitigation.
- [x] RLS policies on all facility-scoped tables + non-owner-role proof (test-specs §P2 deliverable 4, **DB layer**) — **DONE 2026-07-03**: `migrations/202607030002_rls_policies.js` adds a uniform `facility_id = ANY(current_setting('app.current_facility_ids'))` policy (USING + WITH CHECK; unset → default-deny) to all 10 data tables, enabling RLS on the 3 that lacked it. NO `FORCE` (owner must bypass for seed/migrations). `tests/integration/rls.test.js` (7 cases) proves it **as a non-owner role** (`vorge_app_rls`, provisioned in `global-setup`): context→only-that-facility, no-context→0 rows, cross-tenant UPDATE→0 rows (owner-verified unchanged), cross-tenant INSERT→RLS-rejected, pooled sequential different-context txns no leak. Red-checked (permissive policy → 6/7 fail). **Inert until role switch:** app still connects as owner on staging, so zero behavior change until DATABASE_URL points at a non-owner role.
  - [x] **App wiring** — **DONE 2026-07-03**: `src/db/requestScope.js` (`AsyncLocalStorage` `activeConn()` + `runInFacilityScope`) + `src/middleware/facilityScope.js` (resolves the acting role to a concrete facility-id list — operator-wide roles expanded via a `facilities` lookup — and pins the request's DB work to it inside a txn running `set_config('app.current_facility_ids', …, true)`). Repos default `trx = activeConn()`, so reads/mutations auto-use the scoped txn; content mutations open an inner savepoint via `activeConn().transaction`. `facilityScopeFor` moved to `facilityAccessService`. `rlsWiring.test.js` proves it as the non-owner role (scoped read returns rows; no-context read returns `[]`; operator expansion; rollback). Hotfix 2026-07-03 (found by staging smoke): auth audit writes hit `audit_log_entries` RLS with no facility context → login 500; `appendAuditLog` now self-scopes to the entry's facility inside a txn/savepoint (also fixes a silent hash-chain break); `rlsWiring.test.js` +1 regression, red-checked.
  - [x] **User checkpoint (Supabase dashboard)** — **DONE 2026-07-03**: migration `202607030002_rls_policies` run on Supabase staging; non-owner role `vorge_app` + grants created in the SQL editor; Render `vorge-api-staging` `DATABASE_URL` repointed at `vorge_app` (transaction pooler); smoke passed (health + browser login/data on `vorge-app.vercel.app`). **RLS is now live/enforced on staging.**
- [x] Cross-tenant integration tests (2026-07-03): route matrix `tests/integration/tenantIsolation.test.js` (17 cases, supertest + real DB via the P2 harness). Op-A user targeting Op-B resource → GET :id 404 (ASSESSMENT_NOT_FOUND, no existence leak), list returns own-tenant rows only, workflow/mitigation-log mutations 404 **with the target row asserted unchanged in the DB**; wrong-role 403 (ROLE_NOT_ALLOWED + ROLE_NOT_ASSIGNED), unauthenticated 401. Covers every data route that exists today (assessments GET/list/workflow, mitigations mine/log, admin config); **mutation matrix extends when P3 write endpoints land** (test-specs §P2 note). Auth helper `tests/integration/session.js` mints a real session + bearer token mirroring the login route. Red-check verified (flipped a cross-tenant assertion to 200 → failed → reverted).
- [x] Operator-portfolio scoping for HQ Executive (§17.5) covered by tests (2026-07-03): route matrix asserts HQ Exec of Op-A sees ALL Op-A facilities and ZERO Op-B rows (+ Op-B mirror for symmetry).
- [x] Fix mitigations route hardcoding `hasFacilityAccess: true` (2026-06-04 audit finding, `docs/strategic-roadmap.md`) — **DONE 2026-07-03** (duplicate of the ticked item above): now derived from `canAccessFacility` on the loaded mitigation; covered by `tenantIsolation.test.js`.
- [x] Reconcile AGENTS.md invariant 2 wording (2026-07-03): code is correct (`isDemoEnabled()` gates on `VITE_ENABLE_DEMO === "true"`, deliberately not `import.meta.env.DEV`); aligned the doc to the code (heading → "flag-gated", mechanism corrected).

## P3 — Write/section API (P0-priority gap — the missing core)

There are NO write endpoints today (assessments API = GET /, GET /:id, POST /:id/workflow). All demo editing is client-side fixtures; a real Author cannot save anything. Contract extension approved 2026-07-03 (`docs/decisions/2026-07-03-write-section-api.md`; api-contract.md itself edited only on explicit instruction when P3 lands).

**Server-side complete (2026-07-03):** slices (a)–(f) landed & green (250 unit / 107 integration). Foundation: section-text migration (`assessment_sections`, decision recorded) + shared write-guard (`contentWriteGuard.runContentMutation`). Endpoints: Assets/Threats CRUD, links (PUT enable/disable), evaluations (PATCH), contributors (PUT), section text (PUT /sections/:n), withdraw/recall (lockVersion on /workflow), Lead Author reassignment (PUT /lead-author), mitigation owner assignment. Each proven with the §P3 suite (six-case, true lock_version race, state×role matrices, atomic audit, cross-tenant). Also fixed a read-your-writes gap in P2's `facilityScope` (commit-before-flush — `docs/decisions/2026-07-03-facility-scope-commit-before-flush.md`). **Remaining: (g) client flip** (prod mode off fixtures onto live calls + 409-reload RTL) — the only unticked P3 work.

- [x] CRUD endpoints: assets, threats, asset-threat links, evaluations, contributors (+ section-1/2/8 text — `assessment_sections` migration `202607030003`). **DONE 2026-07-03.**
- [x] Optimistic concurrency via existing `lock_version` on every mutation (409 on stale; true concurrent-race test). **DONE 2026-07-03.**
- [x] State/role guards: writes only by Author on Draft (per state machine); by-id routes repo-scoped (getter → 404), enforced by the introspection test. **DONE 2026-07-03.**
- [x] Audit entry on every mutation (`appendAuditLog`, atomic with the write; lowercase-hyphen vocabulary). **DONE 2026-07-03.**
- [~] Flip client prod mode off fixtures onto live calls. **Seam + first vertical slice landed 2026-07-03:** `client/src/api/assessmentApi.js` (typed wrappers for every P3 endpoint) + `WorkspaceContext.saveSectionText` prod↔demo branch; Executive Summary (Section 1) save wired end-to-end (prod: live PUT w/ lockVersion, 409 → reload affordance; demo: fixtures, no fetch). **Remaining: broad per-section rewire** — replicate the seam to the rest of the workspace reads/writes (its own chunk; the whole feature layer was fixtures-only in both modes).
- [x] Withdraw/recall + Lead Author reassignment endpoints (§5.5–5.6) — `lockVersion` on `/workflow` closes the recall-race concern; `PUT /lead-author` (Lead Author or Admin, non-Approved, target-must-be-Author). **DONE 2026-07-03.**
- [x] Mitigation-assignment endpoints (§7 owner management) — `PUT /mitigations/:id/owner` through the write-guard. **DONE 2026-07-03.**
- [x] DoD: `docs/test-specs.md` §P3 — server portions DONE (six-case, true-race lock_version, state×role matrices, atomic audit, section-text round-trip + migration idempotency, cross-tenant matrix extended to every mutation). **Client flip DoD** (prod section-save fires live call w/ lockVersion; 409 renders exact reload copy; demo fires no fetch — fetch spy) DONE via `ExecutiveSummarySection.test.jsx`. **DONE 2026-07-03** (broad per-section rewire tracked above as remaining follow-on, not a §P3 DoD gap).

## P3.5 — Word/PDF export (pulled forward from P5 — approved 2026-07-03)

- [ ] Standard SRA template export, Word + PDF (§16); completes the end-to-end "replaces Word" story for sales demos. Recommend `docx` npm for Word + print-CSS/headless for PDF; export writes an audit entry; export under 30s (§18.6).
- [ ] DoD: `docs/test-specs.md` §P3.5 — golden-content docx assertions (headings/front-matter/mitigations, NOT byte-compare), PDF smoke, role matrix + export audit row, <30s guard.

## P4 — AI module + features (ROI order)

Foundation first: app-layer AI service module wrapping Vercel AI Gateway via the AI SDK — owns per-facility cost ceilings (soft 80% alert / hard suspend), audit-log writes (all §9.7 fields), per-facility prompt scoping, retries, rate limits. Feature code never imports a provider directly (§9's architectural rule preserved; provider/config mechanism deviates — see decision record).

- [ ] AI service module + audit plumbing + cost ceiling tables/config. DoD: `docs/test-specs.md` §P4 — mocked-gateway ceiling/audit/scoping/no-fallback/retry tests, Mitigation-Owner 403 matrix, and the `aiImportBoundary` scan test that mechanically enforces §9's no-direct-provider-imports rule.
- [ ] 1. Semantic library search (pgvector; embedding pipeline on library entry create/update; <500ms).
- [ ] 2. Smart tagging (structured output, controlled vocabulary, async post-save).
- [ ] 3. Drafted Executive Summary / Conclusion (Sections 1 & 8; original retained in audit log).
- [ ] 4. Anomaly detection server engine (AD-2+; client ack loop AD-1 already shipped 2026-05-29).
- [ ] 5. Cross-facility consistency flagging (HQ, nightly batch).
- [ ] 6. Natural-language search — BESPOKE, build last, only when commissioned (§9.5: zero v1 hours).

## P5 — Hardening

DoD: `docs/test-specs.md` §P5 — full reset-email loop with mocked transport, retention-job seed/delete/survive/audited test, Redis swap passing existing tests unchanged, PII-scrub assertion on tracked errors.

- [ ] Wire stubbed email delivery (password reset, notifications). (Word/PDF export moved to P3.5, 2026-07-03.)
- [ ] Monitoring / error tracking (Render logs + an error tracker; recommend Sentry).
- [ ] Audit retention policy (default 7 years, per-facility configurable — §18.3).
- [ ] Redis for rate-limit + MFA replay caches (required before multi-instance scaling).
- [ ] Backups: verify Supabase daily backups / PITR meet §18.5; document restore drill.
- [ ] TLS/CA pinning for DB connection (replace `rejectUnauthorized: false`).

## Suggested improvements & new features

Living review of every major feature area: what exists / what's partial / what's missing / what could be better, plus new-feature suggestions. **Priority here is suggestion-priority (P0 = do soon / blocks value, P1 = high value, P2 = later), NOT the phase numbers above. Effort: S/M/L.** Each suggestion carries a status: **SCHEDULED** (already inside a phase above — no new approval needed), **BACKLOG** (agreed direction, slot it when capacity allows), or **NEEDS DECISION** (user must approve scope/phase before any work). Nothing gets implemented outside an approved phase without user approval. Status claims marked *(verify)* were taken from docs/session-log, not re-read from code this session.

### Area-by-area review (2026-07-03)

| Area | Exists | Partial / missing | Improvement suggestions |
|---|---|---|---|
| **Auth** | Login/JWT/refresh/rotation, logout+revocation, password reset flow, TOTP MFA + lockout + trusted devices, demo gating | Reset **emails are stubbed** (link never delivered); account-lockout on password (not just MFA) *(verify)*; session-timeout not per-facility configurable (§18.1) | [P0/S] wire email — **SCHEDULED (P5)** · [P1/S] admin "reset user's MFA/password" action — **BACKLOG** · [P2/S] configurable session timeouts — **BACKLOG** |
| **Assessment workflow** | Server state machine + transitions + audit + version snapshot on Approve; allowed-actions API | Withdraw/recall (§5.6) server support *(verify)*; recall race = known concern (AGENTS.md); Lead Author reassignment (§5.5) unbuilt server-side | [P1/M] withdraw/recall + reassignment endpoints alongside P3 writes — **SCHEDULED (P3, approved 2026-07-03)** |
| **Sections 1–9 editing** | Rich demo editors client-side; validation w/ human labels; AD-1 anomaly ack on §3 | **Zero server persistence (the P3 gap)**; no DB column for Section 1/2/8 text; comments/field-level review locks (§11.2) demo-only *(verify)* | [P0/L] write API — **SCHEDULED (P3)** · [P1/M] server-side comments + review locks after P3 — **BACKLOG** · [P2/M] autosave + draft-recovery UX — **BACKLOG** |
| **Mitigations** | `GET /mine` + `POST /:id/log` real; owner workflow client-built; progress logs table | Assignment management (who owns what) has no write API; pool role-holder change behaviour (§7.4) unbuilt | [P1/S] assignment endpoints — **SCHEDULED (P3, approved 2026-07-03)** · [P2/S] AI progress-log summarisation (§9.8, explicitly post-v1) — **BACKLOG** |
| **Admin** | `GET /api/admin/configuration` only; admin UI on fixtures | No server CRUD for users, facilities, role assignments, dropdowns, MFA policy, libraries — all §13 surfaces | [P1/L] "P3.5 — Admin write API" phase — **NEEDS DECISION** (new phase) · [P0/S] interim documented SQL snippets for staging onboarding — **BACKLOG** (do with P0) |
| **Audit log** | Append-only writes w/ hash-chain fields on workflow + auth events | **No read endpoint at all** (client /audit is fixtures); per-role visibility (§10.2) undecided (AGENTS.md open concern); retention = P5 | [P1/M] `GET /api/audit` w/ role/facility scoping — **NEEDS DECISION** (§10.2 visibility question is an AGENTS.md flagged concern) · [P2/S] hash-chain verification job — **BACKLOG** |
| **Field mode / offline** | Client messaging + online-only feature list (illustrative) | Whole §8 (PWA, per-section checkout, offline auth/PIN) unbuilt | [P2/L] defer until customers ask; graceful read-only fallback (§8.4) as near-term target — **NEEDS DECISION** (deviates from §8 "ships in main build") |
| **Exports (Word/PDF)** | Nothing | Table stakes for "replaces Word" (§16) | [P1/L] **SCHEDULED (P3.5, approved 2026-07-03)** — pulled forward from P5 for the end-to-end sales story; docx npm + print-CSS PDF |
| **Notifications** | Client inbox model, role-filtered, fixtures; triggers specced (§15) | No server model/endpoints/email channel | [P2/M] notifications table + triggers built WITH P3 mutations (write points are where triggers live; cheap then, expensive later) — **NEEDS DECISION** (adds to P3 scope) |
| **AI (6 features)** | AD-1 ack loop client-side; §9 module specced; gateway decision recorded | Everything server-side = P4 | **SCHEDULED (P4)** · [P1/S] stamp `facility_id` + trace plumbing through all P3 routes for clean P4 drop-in — **BACKLOG** (fold into P3 execution) |
| **HQ Executive view** | Dashboard on fixtures; heatmap/KPIs specced (§14) | No aggregate server queries; consistency flagging = P4 | [P1/M] read-only portfolio aggregates endpoint after P2 — **BACKLOG** (high demo value; isolation must land first) |
| **Mobile UX** | Mobile-first shells, demo mobile gate, whole-row tap target on Author dashboard | Same tap-target fix pending on Reviewer/Approver/HQ/MitOwner dashboards; §5 grid virtualization | [P1/S] replicate row tap-target fix (pattern proven) — **BACKLOG** · [P2/M] virtualization at real data scale — **BACKLOG** |
| **Dark mode** | ~52%; auth pages tokenized; login brand treatment | Toggle on auth routes; `prefers-color-scheme`; shared components; dashboards | **SCHEDULED (side-quest)** — [P1/S] chunks, any time |

### New feature suggestions (not in any current phase)

- [P1/M] **Annual clone / carry-forward** — already specced (§6.10) but in no phase; natural P3 follow-on reusing the write API; the yearly-SRA cadence is the core usage loop, so this is the retention feature. — **NEEDS DECISION** (which phase)
- [P1/S] **Staging onboarding kit** — scripted creation of a real operator/facility/users (replaces hand-SQL once P0 lands; precursor to the admin write API). — **BACKLOG**
- [P1/M] **Bulk import (CSV/XLSX) of assets & threats** — every migration from Word/Excel starts with a big list; hours saved on day one of any pilot; fits Section 3/4 write endpoints. — **NEEDS DECISION** (new feature, not in spec)
- [P2/M] **Version history UI + diff** (§10.4–10.5) — snapshots already written on Approve; surfacing them is mostly read API + UI. — **BACKLOG**
- [P2/M] **Library management CRUD + seeding** (§12) — table exists, no endpoints; prerequisite for P4 semantic search to have content worth searching. — **BACKLOG** (must land before/with P4 feature 1)
- [P2/S] **E2E smoke harness (Playwright) against staging** — once P0 exists, one scripted login→edit→submit→approve run guards every deploy; cheap insurance before P3's client flip. — **BACKLOG**
- [P2/S] **Status/uptime probe** on `/health` + Supabase (free tier UptimeRobot) — staging will be demoed; know it's down before the prospect does. — **BACKLOG** (fold into P5 monitoring)

## Side-quest — Dark mode (~52%, cosmetic, any time)

- [ ] Brand/logo treatment on remaining 6 auth pages; gold CTA app-wide decision.
- [ ] Theme toggle on login/MFA routes; honor `prefers-color-scheme`.
- [ ] Shared components (Chunk B) + dashboards/workspace/admin.
- [ ] Critical-severity dark text — awaiting designer sign-off (non-code blocker).
