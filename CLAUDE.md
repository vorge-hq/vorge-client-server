# Claude Code Instructions

**Rules:** [AGENTS.md](./AGENTS.md)

**Status map:** [docs/production-status.md](./docs/production-status.md) — read before planning multi-step work.

**Execution checklist:** [docs/roadmap.md](./docs/roadmap.md) — P0–P5 production push; tick items as they land.

**Diary:** [SESSION_LOG.md](./SESSION_LOG.md) — append on meaningful progress; never duplicate the full map here.

## Doc updates — automatic (user will not prompt for this)

Keep planning files current without rewriting them. **`docs/roadmap.md` and `docs/production-status.md` were authored deliberately — tick boxes and update status rows only; do not restructure phases, reorder sections, or rewrite the plan body unless the user explicitly asks.**

| File | What to update |
|---|---|
| `docs/roadmap.md` | Tick completed checklist items; add backlog lines under **Suggested improvements** for new ideas (status: BACKLOG or NEEDS DECISION). |
| `SESSION_LOG.md` | Append one entry per meaningful session (diary only — never duplicate the map here). |
| `docs/production-status.md` | **Status now** table and **Last updated** line when a track/phase status changes. |
| `CLAUDE.md` → **Current focus** | Rewrite when the user changes direction or a phase completes — so agents don't chase stale priorities. |

Do **not** create `docs/decisions/*` records or edit `docs/strategic-roadmap.md` unless the user explicitly asks. `Notes.txt` is personal scratch — promote ideas into `docs/roadmap.md` when they become real.

Update the four files above when ANY of these is true:
1. Before `git commit` if changes include client/src/, server/src/, or server/migrations/
2. When you finish a coding task — before your final reply to the user
3. When the user says ship, done, merge, commit, or PR
4. When the user changes direction or adds a new idea (even if no code shipped)

Skip only for trivial typo/comment edits with no behavior or status change.

SESSION_LOG format: date — title — what shipped — key files — test counts if make test was run.

## Commit conventions

Never add `Co-Authored-By` trailers or any AI attribution to commit messages or PR bodies. Commits must show only the human author — no Claude, Cursor, or Anthropic co-author lines.

## Current focus
1. **P3 — Write/section API** ⬅ **ACTIVE — server-side DONE + client-flip DoD met (2026-07-03); one follow-on remains.** All write endpoints green (250 unit / 107 integration). Client (g): API seam `client/src/api/assessmentApi.js` (all endpoints) + `WorkspaceContext.saveSectionText` prod↔demo branch; Executive Summary save wired live (lockVersion + 409 reload copy; demo no-fetch) with the §P3 "Client flip" RTL test. **(g) client flip in progress:** write seam (all endpoints) + §1/§8 narrative saves; prod reads hydrate the assessments **list** (`GET /api/assessments`, server-scoped per the 2026-07-03 visibility decision) and the opened **workspace** assessment (`GET /:id`, fields + section text) via `client/src/api/adapters.js`; demo keeps fixtures. **2026-07-04: content-entity READS + §2 + Assets WRITES landed.** Reads: `hydrateAssessmentBundle` hydrates assets/threats/links(→matrix)/evaluations from the bundle in prod via `toClientAsset/toClientThreat/toClientEvaluation/toClientLinks`; canonical JSONB field mapping in `docs/decisions/2026-07-04-content-entity-field-mapping.md`. §2 Facility Info: DECIDED serialize structured form → JSON in section-2 `content_text` (no new server model); wired via `serializeFacilityInfo/parseFacilityInfo` + `FacilityInfoSection` save-on-blur. **ALL content-entity writes flipped (2026-07-04):** Assets/Threats (CRUD via `toServerAssetPayload`/`toServerThreatPayload`), asset×threat-link toggle (`toggleMatrix`→`PUT /links`), Evaluations (`toServerEvaluationPayload` + `persistEvaluation`→PATCH on blur), Contributors (`saveContributors`→whole-list PUT) — all through the prod↔demo seam (local-optimistic + blur/discrete persist, `stateRef` fresh lockVersion, 409 banners; demo no-fetch). Fetch-spy suites per section. Eval create-gap CLOSED: `setAssetThreatLink` auto-creates + echoes an empty evaluation on link-enable, so freshly-ticked Section-6 cells persist (client adds the returned UUID row). **P3 (g) client flip COMPLETE — 250 unit / 176 client / 109 integration green; P3 write/section API is feature-complete end-to-end.** Run integration locally with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test make test` (docker `vantage-db` + `vorge_test` DB). See `docs/decisions/2026-07-04-content-entity-field-mapping.md`. Then, on explicit instruction, edit `docs/api-contract.md` to document the new endpoints (quote the decision records). Do NOT edit `docs/api-contract.md` before that instruction.
2. **Done:** P2 — Tenant isolation ✅ complete 2026-07-03 (repo/route guards, cross-tenant matrix, RLS policies + app wiring + non-owner `vorge_app` role; verified live on staging). P0 infra ✅ complete 2026-07-03.
Side-quest: dark mode (~52%), any time.

Auth truth order: code + SESSION_LOG > chunk-4 decisions > docs/server.md / README

Commands: prefer make test, make migrate, make start.
