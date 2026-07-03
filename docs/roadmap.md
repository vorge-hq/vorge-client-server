# Production Roadmap — Living Checklist

> **Current phase: P0 — Infra grounding (in progress since 2026-07-03).** Locked decisions: Supabase = managed Postgres only (keep custom JWT/bcrypt/MFA auth); server = Render web service from `server/Dockerfile` (single instance — in-memory rate-limit/MFA caches); real client = NEW Vercel project (`VITE_ENABLE_DEMO=false`), demo project `vorge-demo-roles` untouched; AI = Vercel AI Gateway + AI SDK behind an app-layer module (§9 deviation SIGNED OFF 2026-07-03; write/section API contract extension SIGNED OFF 2026-07-03 — see `docs/decisions/2026-07-03-*`). Do not push past a phase without user review.

**How this file relates to the others:** `docs/production-status.md` is the product-state map; this file is the production-push execution checklist. Tick boxes here (and append `SESSION_LOG.md`) on every meaningful change and before any commit touching `client/src/`, `server/src/`, or `server/migrations/`. Phase mapping to the old AGENTS.md numbering: old Phase 1 = P1 (done), old Phase 2 = P2, old Phase 3 ≈ P0 + P5.

**Standing rules for every phase:** `make test` before every commit; 95% server-service coverage gate stays; never commit `.env` (check `git status`); fresh prod secrets via `openssl rand -base64 32`; no sign-ups/deploys/spend by the agent — dashboard steps are handed to the user (see `docs/infrastructure.md`); `docs/businesslogic.md` and `docs/api-contract.md` are not edited — deviations go in `docs/decisions/`.

---

## P0 — Infra grounding ⬅ CURRENT

Outcome: a real staging environment (Supabase DB + Render API + non-demo Vercel client), not fixtures.

Code/config changes (agent):
- [ ] Knex production config: SSL for Supabase (`ssl: { rejectUnauthorized: false }` now; CA pinning deferred to P5) and support for a separate migration connection string (pooled `DATABASE_URL` for the app, direct/session `MIGRATE_DATABASE_URL` for `make migrate`).
- [ ] New migration: `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector — idempotent, additive; embeddings columns come later in P4).
- [ ] Cookie cross-site fix: refresh + MFA-trust cookies are hardcoded `sameSite: "strict"` (`modules/auth/routes.js`, `services/mfaTrustDeviceService.js`). With client on `*.vercel.app` and API on `*.onrender.com` they will never be sent — refresh and trusted-device MFA silently break. Add env-driven `COOKIE_SAME_SITE` (default `strict` locally, `none` in cross-site prod, requires `Secure`). Record CSRF posture in the decision log.
- [ ] `CORS_ORIGIN` must support the new Vercel domain (verify single-origin is enough; if preview URLs are wanted, make it a comma-list — recommend: prod domain only, previews deferred).
- [ ] Env examples: document new vars (`MIGRATE_DATABASE_URL`, `COOKIE_SAME_SITE`) — NOTE `.env.example` edits require human review per AGENTS.md; hand the diff to the user.
- [ ] Client prod env shape documented (`VITE_ENABLE_DEMO=false`, `VITE_API_BASE_URL=<render-url>`).

Manual dashboard steps (user — click-by-click in `docs/infrastructure.md`):
- [ ] Create Supabase project; capture pooled + direct connection strings; enable `vector` extension.
- [ ] `make migrate` then `make seed` against Supabase (run locally by user with prod env).
- [ ] Create Render web service from `server/Dockerfile`; set env vars; single instance; verify `/health`.
- [ ] Create NEW Vercel project (root `client/`, Vite) with `VITE_ENABLE_DEMO=false`, `VITE_API_BASE_URL`; deploy.
- [ ] Smoke: real login → JWT → refresh → MFA enroll/verify against staging.

## P1 — Auth ✅ done (record only)

Login → JWT → refresh (rotating httpOnly cookie + family revocation), session revocation/logout, password reset (email delivery stubbed — wired in P5), TOTP MFA + enforcement + trusted devices, demo personas env-gated. Chunks 0–4; records in `SESSION_LOG.md`, git tags, `docs/decisions/chunk-4-mfa.md`.

## P2 — Tenant isolation (P0 security — must land before real customer data)

- [ ] Apply `authenticate` + `requireFacilityAccess` to every data route (middleware currently wired into ZERO routes; scoping today lives only in repo-level `canAccessFacility` filters).
- [ ] Audit every `server/src/repositories/` query for `facilityId` scoping — note `listAssessmentsForUser` currently fetches ALL rows then filters in JS; push scoping into SQL.
- [ ] Real Supabase RLS policies on all assessment-scoped tables (RLS is ENABLEd since the initial migration but zero policies exist). Design constraints: app connects as a single DB role → policies keyed on `set_config`/`SET LOCAL` per transaction; app role must be a NON-owner (table owners bypass RLS unless `FORCE ROW LEVEL SECURITY`); `SET LOCAL` works with Supabase transaction pooling only inside explicit transactions.
- [ ] Cross-tenant integration tests: Tenant A requesting Tenant B data returns 403/404 on every data route (penetration-testable per businesslogic §17.4).
- [ ] Operator-portfolio scoping for HQ Executive (§17.5) covered by tests.

## P3 — Write/section API (P0-priority gap — the missing core)

There are NO write endpoints today (assessments API = GET /, GET /:id, POST /:id/workflow). All demo editing is client-side fixtures; a real Author cannot save anything. Contract extension approved 2026-07-03 (`docs/decisions/2026-07-03-write-section-api.md`; api-contract.md itself edited only on explicit instruction when P3 lands).

- [ ] CRUD endpoints: assets, threats, asset-threat links, evaluations, contributors (+ section-1/8 text content — schema gap: no column holds Executive Summary/Conclusion text; needs a migration).
- [ ] Optimistic concurrency via existing `lock_version` on every mutation (409 on stale).
- [ ] State/role guards: writes only by Author on non-Approved (per state machine); every route through `requireFacilityAccess`.
- [ ] Audit entry on every mutation (existing `appendAuditLog` vocabulary).
- [ ] Flip client prod mode off fixtures onto live calls (`api/client.js` already handles auth/refresh; wire feature data fetching + saves).
- [ ] Withdraw/recall + Lead Author reassignment endpoints (§5.5–5.6) — approved into P3 scope 2026-07-03 (same guards as other writes; resolves the AGENTS.md recall-race concern via `lock_version`).
- [ ] Mitigation-assignment endpoints (§7 owner management) — approved into P3 scope 2026-07-03.
- [ ] Integration tests per route incl. cross-tenant + stale-lock cases.

## P3.5 — Word/PDF export (pulled forward from P5 — approved 2026-07-03)

- [ ] Standard SRA template export, Word + PDF (§16); completes the end-to-end "replaces Word" story for sales demos. Recommend `docx` npm for Word + print-CSS/headless for PDF; export writes an audit entry; export under 30s (§18.6).

## P4 — AI module + features (ROI order)

Foundation first: app-layer AI service module wrapping Vercel AI Gateway via the AI SDK — owns per-facility cost ceilings (soft 80% alert / hard suspend), audit-log writes (all §9.7 fields), per-facility prompt scoping, retries, rate limits. Feature code never imports a provider directly (§9's architectural rule preserved; provider/config mechanism deviates — see decision record).

- [ ] AI service module + audit plumbing + cost ceiling tables/config.
- [ ] 1. Semantic library search (pgvector; embedding pipeline on library entry create/update; <500ms).
- [ ] 2. Smart tagging (structured output, controlled vocabulary, async post-save).
- [ ] 3. Drafted Executive Summary / Conclusion (Sections 1 & 8; original retained in audit log).
- [ ] 4. Anomaly detection server engine (AD-2+; client ack loop AD-1 already shipped 2026-05-29).
- [ ] 5. Cross-facility consistency flagging (HQ, nightly batch).
- [ ] 6. Natural-language search — BESPOKE, build last, only when commissioned (§9.5: zero v1 hours).

## P5 — Hardening

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
