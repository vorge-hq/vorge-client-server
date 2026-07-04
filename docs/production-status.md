# Production Status

Living checklist and map for getting Vorge to production. **`SESSION_LOG.md` is the diary** (append-only, chronological, what-happened). **This file is the map** (current state, what's left, work order). Keep this file current when status changes; never duplicate the diary here.

Last updated: 2026-07-03 · Branch: `main`. Brand: **Vorge** (rebranded from Vantage on 2026-06-02 — see SESSION_LOG).

> **2026-07-03:** The production push now runs on **`docs/roadmap.md` (P0–P5)** — that file is the execution checklist to tick; this file stays the product-state map. The 2026-06-04 strategic retrospective (originally authored at `docs/roadmap.md`) now lives at **`docs/strategic-roadmap.md`**. Locked: Supabase (managed Postgres only), Render (Docker web service), new non-demo Vercel project, Vercel AI Gateway + AI SDK (§9 deviation + write-API contract extension both signed off 2026-07-03 — `docs/decisions/2026-07-03-*`). P0 in progress.

---

## Planning layers

Four reference frames describe the same product at different altitudes. Three are top-level tracks; auth chunks are the breakdown of Production-push Phase 1. `docs/strategic-roadmap.md` (last row) is not a fifth frame — it synthesizes all of them into one strategic view; `docs/roadmap.md` is the execution checklist that runs the production push.

| Layer | Where it lives | Scope |
|---|---|---|
| **Production push (Phases 1–3)** | `AGENTS.md` → "Production push roadmap" | The active engineering track: real auth → tenant isolation → prod hosting. |
| ↳ **Auth chunks 0–4** | `SESSION_LOG.md` + git tags + `docs/decisions/chunk-4-*` | The completed Phase 1 breakdown. Chunks 0–3 predate the lockbox pattern (see `HISTORICAL_CONTEXT.md`); chunk 4 onward has decision records. |
| **MSA milestones M1–M6** | Drive (`Vantage_Master_Build_Plan.docx`); index in `docs/decisions/HISTORICAL_CONTEXT.md` | Contractual delivery schedule across dev / designer / AI-ops. Not mirrored in-repo. |
| **Full v1 product** | `docs/plan.md`, `docs/server-build-plan.md`, `docs/client-build-plan.md`, `docs/businesslogic.md` | The complete v1 feature set the platform is being built toward. |
| **Strategic roadmap** | **See also: `docs/strategic-roadmap.md`** | Retrospective + forward synthesis across all layers: evidence-backed current-state matrix, Now/Next/Later horizons, dependency graph. The strategic superset of this tactical map. |

---

## Status now

| Track | Status | Notes |
|---|---|---|
| Phase 1 — Real authentication | ✅ **Done** | Login → JWT → refresh, demo gating, password reset, TOTP MFA. Chunks 0–4 complete. |
| Phase 2 — Tenant isolation hardening | ✅ **Done (2026-07-03)** | Integration harness + repo isolation + SQL-scoped list; **cross-tenant ROUTE matrix** (404/403/401, HQ §17.5 portfolio); **route-guard introspection test** + two-guard decision (middleware for payload-facility routes, repo-scoped getter for by-id — `docs/decisions/2026-07-03-repo-scoped-facility-access.md`); **RLS policies + app wiring + non-owner-role proof** (`rls.test.js` + `rlsWiring.test.js`: per-txn `app.current_facility_ids` policy on all 10 data tables; every request pinned via `runInFacilityScope`/`activeConn`; default-deny). Invariant 2 (demo gating) reconciled. **RLS live on staging** (Supabase migration + non-owner `vorge_app` role + Render `DATABASE_URL` repointed). Staging smoke caught + fixed 3 blockers: URL-encoded password (rotated to hex), Render env var name (`DATABASE_URL`), and a P0 login regression — auth audit writes hit `audit_log_entries` RLS with no facility context → 500; `appendAuditLog` now self-scopes to the entry's facility. **Pending: Render redeploy + re-smoke to confirm login + `GET /api/assessments` serve real data.** |
| Phase 3 — Production hosting | 🟡 **Staging live (2026-07-03)** | Supabase `vorge-staging` + Render `vorge-api-staging` + Vercel `vorge-app`; cross-site login/refresh/data smoke passed. Remaining P3-era: monitoring, audit retention, backups (roadmap P5). |
| Dark mode (side-quest) | 🟡 **~52%** | Logged-in AppShell themes correctly. **Auth pages fully tokenized (Chunk A + bg-white surface fix, 2026-05-29)** — text AND surfaces theme-safe; 7/48 files. **LoginPage brand+logo dark treatment landed (2026-05-29):** real logo SVGs wired (white wordmark in dark), lighter-navy heading, brand-amber #F49D0D gold CTA (LoginPage-scoped). Still pending: same brand/logo treatment on the other 6 auth pages; gold-CTA app-wide; theme toggle on login/MFA; `prefers-color-scheme` not honored (dark is localStorage-driven); shared components (Chunk B) + dashboards/workspace/admin; critical-severity text awaiting designer. |

Demo is deployed manually (`vercel --prod`) to `vorge-demo-roles.vercel.app`; git auto-deploy intentionally disconnected.

---

## Auth chunks 0–4 (Phase 1 breakdown — all done)

| Chunk | Topic | Boundary tag | Records |
|---|---|---|---|
| 0 | Demo env-gating | `pre-env-gating` | commits + tests |
| 1 | Session revocation / logout | `pre-auth-logout` | commits + tests |
| 2 | Refresh tokens | `pre-refresh-tokens` | commits + tests |
| 3 | Password reset | `pre-password-reset` | commits + tests |
| 4 | TOTP MFA + enforcement | `pre-mfa-enforcement`, `pre-cleanup-user-agent` | `docs/decisions/chunk-4-mfa.md` (lockbox pattern starts here) |

`pre-production-push` marks the pre-Phase-1 baseline. For chunks 0–3, reconstruct detail from commits + tests per `HISTORICAL_CONTEXT.md`.

---

## Phase 1 follow-ups (small, deferred — see `docs/considered-and-deferred.md`)

| Item | Status |
|---|---|
| Auth pages off `zinc-*` (incl. LoginPage "SRA Platform" subhead) | ✅ Done — Chunk A, 2026-05-29 (scrim left literal by decision) |
| Theme toggle on public / login / MFA routes | Deferred (its own chunk) |
| `prefers-color-scheme` support in `useTheme` | Deferred (pairs with auth-page theming) |
| Critical-severity dark text — designer sign-off on WCAG override (`#FF5C61`) | Pending designer (non-code blocker; current value passes AA) |
| Deep-link validation errors to the offending matrix cell | Deferred (needs `ValidationSummary` refactor) |
| Whole-row tap target on other dashboards (Reviewer/Approver/HQ Exec/Mitigation Owner) | Deferred (Author dashboard done) |
| Production Authors resume at last-viewed section vs hardcoded section 2 | Open product question |

---

## Recommended work order

1. **Finish dark mode** — auth pages off `zinc-*` + `prefers-color-scheme` + theme toggle on login/MFA. Visible, demo-facing, low risk. Most prominent gap.
2. **Phase 2 — tenant isolation** (P0 security): ✅ **Done 2026-07-03** — repo/route guards + RLS policies + app wiring; RLS live on staging (non-owner `vorge_app` role). Next: P3 write/section API (paused for user go-ahead).
3. **Phase 3 — production hosting**: managed Postgres, server host, secrets, monitoring, audit retention, prod envs.

Rationale: dark mode is shallow and demo-facing (quick win); Phase 2 is the highest-severity correctness work; Phase 3 is the deploy-infra capstone once the app is correct.

---

## Full v1 snapshot

Per `docs/plan.md` + build plans. Status is indicative — verify against code before relying on it.

| Area | v1 intent | Status |
|---|---|---|
| Authentication | Email/pw, JWT, refresh, reset, TOTP MFA | ✅ Done (Phase 1) |
| Roles & role-switching | 6 roles, audited acting-role switch | ✅ Core built |
| Assessment lifecycle | Draft → In Review → Awaiting Approval → Approved, server state machine | 🟡 Built; server enforcement to confirm in Phase 2 |
| Facility / tenant isolation | `facility_id` scoping + repo/route guards + RLS | ✅ Enforced (P2 done 2026-07-03); RLS live on staging via non-owner `vorge_app` role |
| Audit logging | Immutable, append-only, hash-chain fields | 🟡 Built; retention policy = Phase 3 |
| Mitigation workflow | Post-approval Mitigation Owner track | 🟡 Built |
| Field mode | Offline/field foundations | 🟡 v1 foundations |
| Exports | Word / PDF | ⬜ Not started — confirmed absent: no client export lib, only `alert()` stubs, no server route (audit 2026-06-04, see `docs/strategic-roadmap.md` §4). Scheduled: roadmap P3.5 (pulled forward 2026-07-03). |
| Admin config | Users, facilities, dropdowns | 🟡 Built |
| AI features (6) | AI service module | 🟡 AD-1 anomaly acknowledgement (Section 3 assets) shipped 2026-05-29 (client-only, advisory). AD-2–AD-4 + other AI features not started; backend rule engine deferred. |

Legend: ✅ done · 🟡 partial / needs verification · ⬜ not started.
