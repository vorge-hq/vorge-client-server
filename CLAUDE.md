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
1. **P3 — Write/section API** ⬅ **ACTIVE — server-side DONE 2026-07-03; only (g) client flip remains.** All write endpoints landed & green (content CRUD + section text + withdraw/recall + Lead Author reassignment + mitigation-owner assignment; 250 unit / 107 integration). **Next: (g)** — flip client prod mode (`VITE_ENABLE_DEMO=false`) off `client/src/data` fixtures onto live API calls with `lockVersion`; 409 renders the "modified by another user — reload" copy; demo mode keeps fixtures (assert with a fetch spy). Binding: `docs/test-specs.md §P3` "Client flip". Build context in `docs/p3-kickoff.md` (g). Do NOT edit `docs/api-contract.md` without explicit instruction (edit it only when P3 fully lands).
2. **Done:** P2 — Tenant isolation ✅ complete 2026-07-03 (repo/route guards, cross-tenant matrix, RLS policies + app wiring + non-owner `vorge_app` role; verified live on staging). P0 infra ✅ complete 2026-07-03.
Side-quest: dark mode (~52%), any time.

Auth truth order: code + SESSION_LOG > chunk-4 decisions > docs/server.md / README

Commands: prefer make test, make migrate, make start.
