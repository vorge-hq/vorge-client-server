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
0. **P4 + P4.5 — building. O1 ✅ + O2 ✅ + F2 gate ✅ + O3 ✅ (semantic search) + O4 ✅ (smart tagging) — all 2026-07-04. ⬅ NEXT: Opus build session O5 (drafted Executive Summary/Conclusion — `/model opus`).** Model split = Fable specs/gates, Opus builds. **O4 delivered smart tagging** (migration `tag_vocabulary`+`scenario_tags` RLS; `POST /api/assessments/:id/evaluations/:evalId/suggest-tags` structured-output `runAiCall({kind:'object'})` → `tagVocabularyService.validateTags` discards out-of-vocab → `suggested` rows; `POST .../tags/confirm` → `confirmed`; `ai-tags-suggested`/`tags-confirmed` audited separately; reusable `loadWritableAssessment` extracted from `contentWriteGuard` — role/state gate with NO lock bump; `ScenarioTags` chips wired through the prod↔demo seam, 30s auto-confirm; 379 unit / 163 integration / 198 client). No gate before O5 (next gate is F3 after O8). **Binding playbook: `docs/plans/p4-execution-plan.md`** — session order O1–O9, architecture (`server/src/ai/` module, `runAiCall` contract), and the escalation rule (deviations → Open questions section, never improvised). **F2 verified the O2 foundation and resolved all 3 open questions (now binding, in the playbook's Open questions + O7 block):** retry taxonomy (permanent 4xx/validation → no retry, `502 AI_CALL_FAILED`; classifier at the gateway seam), scope guards (`AI_SCOPE_MISSING`; `consistency_flagging` is the only operator-scoped gated feature — its entitlement is enforced by the O7 job's entitled-facility selection), and the O7 job's elevated DB-connection requirement for operator-scoped rows. DoD: `docs/test-specs.md` §P4 (extended at F2) + **§P4.5**. Remaining gate: **F3 after O8** (PLATFORM_OWNER + provisioning) — STOP and ask the user to switch models. Decisions standing: entitlements owner-only v1 (keys `anomaly_detection`/`consistency_flagging`/`offline_mode`); P4.5 support access = **link-only** (no impersonation). Build sessions: `/model opus`, start by reading the playbook.
0.5 **P6 — Offline / Field mode — SPECCED 2026-07-04, builds AFTER P4.5 (do not start before).** Fable design session resolved the §8-vs-roadmap conflict: whole-assessment exclusive checkout (supersedes per-section — `docs/decisions/2026-07-04-offline-mode-architecture.md`), sync replay through `contentWriteGuard`, PIN-only offline auth, `offline_mode` entitlement-gated (free tier = §8.4 read-only fallback + PWA shell). **Binding playbook: `docs/plans/p6-offline-execution-plan.md`** (O1–O6, Fable gates F4 after O3 / F5 after O6; feature stays dark until F5). DoD: `docs/test-specs.md` §P6. Hard dependency: P4's `facility_entitlements` migration (O1 alone is dependency-free). Build sessions: `/model opus`, start by reading the playbook.
1. **Done (2026-07-04): P3.5 — Word/PDF export** ✅ (261 unit / 184 client / 124 integration). Server `GET /api/assessments/:id/export?format=docx|pdf` (`exportService.js`/`exportRepository.js`, docx + pdfkit, watermark, frozen snapshot, role matrix, 15 integration tests) + client `ExportModal` through the prod↔demo seam. Only §16.5 custom templates deferred (BACKLOG).
2. **P3 — Write/section API ✅ COMPLETE (2026-07-04).** Server + client flip both done (250 unit / 176 client / 109 integration at close). Full history below for reference.
   - **[P3 detail]** server-side DONE + client-flip DoD met (2026-07-03); one follow-on remains. All write endpoints green (250 unit / 107 integration). Client (g): API seam `client/src/api/assessmentApi.js` (all endpoints) + `WorkspaceContext.saveSectionText` prod↔demo branch; Executive Summary save wired live (lockVersion + 409 reload copy; demo no-fetch) with the §P3 "Client flip" RTL test. **(g) client flip in progress:** write seam (all endpoints) + §1/§8 narrative saves; prod reads hydrate the assessments **list** (`GET /api/assessments`, server-scoped per the 2026-07-03 visibility decision) and the opened **workspace** assessment (`GET /:id`, fields + section text) via `client/src/api/adapters.js`; demo keeps fixtures. **2026-07-04: content-entity READS + §2 + Assets WRITES landed.** Reads: `hydrateAssessmentBundle` hydrates assets/threats/links(→matrix)/evaluations from the bundle in prod via `toClientAsset/toClientThreat/toClientEvaluation/toClientLinks`; canonical JSONB field mapping in `docs/decisions/2026-07-04-content-entity-field-mapping.md`. §2 Facility Info: DECIDED serialize structured form → JSON in section-2 `content_text` (no new server model); wired via `serializeFacilityInfo/parseFacilityInfo` + `FacilityInfoSection` save-on-blur. **ALL content-entity writes flipped (2026-07-04):** Assets/Threats (CRUD via `toServerAssetPayload`/`toServerThreatPayload`), asset×threat-link toggle (`toggleMatrix`→`PUT /links`), Evaluations (`toServerEvaluationPayload` + `persistEvaluation`→PATCH on blur), Contributors (`saveContributors`→whole-list PUT) — all through the prod↔demo seam (local-optimistic + blur/discrete persist, `stateRef` fresh lockVersion, 409 banners; demo no-fetch). Fetch-spy suites per section. Eval create-gap CLOSED: `setAssetThreatLink` auto-creates + echoes an empty evaluation on link-enable, so freshly-ticked Section-6 cells persist (client adds the returned UUID row). **P3 (g) client flip COMPLETE — 250 unit / 176 client / 109 integration green; P3 write/section API is feature-complete end-to-end.** Run integration locally with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test make test` (docker `vantage-db` + `vorge_test` DB). See `docs/decisions/2026-07-04-content-entity-field-mapping.md`. Then, on explicit instruction, edit `docs/api-contract.md` to document the new endpoints (quote the decision records). Do NOT edit `docs/api-contract.md` before that instruction.
3. **Done:** P2 — Tenant isolation ✅ complete 2026-07-03 (repo/route guards, cross-tenant matrix, RLS policies + app wiring + non-owner `vorge_app` role; verified live on staging). P0 infra ✅ complete 2026-07-03.
Side-quest: dark mode (~52%), any time.

Auth truth order: code + SESSION_LOG > chunk-4 decisions > docs/server.md / README

Commands: prefer make test, make migrate, make start.
