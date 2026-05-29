# Production Status

Living checklist and map for getting Vantage to production. **`SESSION_LOG.md` is the diary** (append-only, chronological, what-happened). **This file is the map** (current state, what's left, work order). Keep this file current when status changes; never duplicate the diary here.

Last updated: 2026-05-29 · Branch: `main` · Tree: clean at the latest auth + demo-polish work.

---

## Planning layers

Four reference frames describe the same product at different altitudes. Three are top-level tracks; auth chunks are the breakdown of Production-push Phase 1.

| Layer | Where it lives | Scope |
|---|---|---|
| **Production push (Phases 1–3)** | `AGENTS.md` → "Production push roadmap" | The active engineering track: real auth → tenant isolation → prod hosting. |
| ↳ **Auth chunks 0–4** | `SESSION_LOG.md` + git tags + `docs/decisions/chunk-4-*` | The completed Phase 1 breakdown. Chunks 0–3 predate the lockbox pattern (see `HISTORICAL_CONTEXT.md`); chunk 4 onward has decision records. |
| **MSA milestones M1–M6** | Drive (`Vantage_Master_Build_Plan.docx`); index in `docs/decisions/HISTORICAL_CONTEXT.md` | Contractual delivery schedule across dev / designer / AI-ops. Not mirrored in-repo. |
| **Full v1 product** | `docs/plan.md`, `docs/server-build-plan.md`, `docs/client-build-plan.md`, `docs/businesslogic.md` | The complete v1 feature set the platform is being built toward. |

---

## Status now

| Track | Status | Notes |
|---|---|---|
| Phase 1 — Real authentication | ✅ **Done** | Login → JWT → refresh, demo gating, password reset, TOTP MFA. Chunks 0–4 complete. |
| Phase 2 — Tenant isolation hardening | ⬜ Not started | `requireFacilityAccess` exists but not enforced on every data route; repo scoping audit + cross-tenant tests outstanding. |
| Phase 3 — Production hosting | ⬜ Not started | Managed Postgres, server host, secrets mgmt, monitoring, audit retention, prod Vercel envs. |
| Dark mode (side-quest) | 🟡 **~52%** | Logged-in AppShell themes correctly. **Auth pages fully tokenized (Chunk A + bg-white surface fix, 2026-05-29)** — both text AND surfaces now theme-safe; 7/48 files. Still pending: no theme toggle on login/MFA routes; `prefers-color-scheme` not honored (so dark mode won't activate pre-login yet — it's localStorage-driven); other surfaces (dashboards/components/workspace/admin); critical-severity text awaiting designer sign-off. |

Demo is deployed manually (`vercel --prod`) to `vantage-demo-roles.vercel.app`; git auto-deploy intentionally disconnected.

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
2. **Phase 2 — tenant isolation** (P0 security): make `requireFacilityAccess` non-optional on all data routes, audit every `server/src/repositories/` query for `facilityId` scoping, add cross-tenant 403/404 integration tests.
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
| Facility / tenant isolation | `facility_id` scoping + RLS foundations | 🟡 Schema in place; enforcement = Phase 2 |
| Audit logging | Immutable, append-only, hash-chain fields | 🟡 Built; retention policy = Phase 3 |
| Mitigation workflow | Post-approval Mitigation Owner track | 🟡 Built |
| Field mode | Offline/field foundations | 🟡 v1 foundations |
| Exports | Word / PDF | ⬜ To confirm |
| Admin config | Users, facilities, dropdowns | 🟡 Built |
| AI features (6) | AI service module | ⬜ Not started (spec in Drive) |

Legend: ✅ done · 🟡 partial / needs verification · ⬜ not started.
