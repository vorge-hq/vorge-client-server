# Claude Code Instructions

**Rules:** [AGENTS.md](./AGENTS.md)

**Status map:** [docs/production-status.md](./docs/production-status.md) — read before planning multi-step work.

**Diary:** [SESSION_LOG.md](./SESSION_LOG.md) — append on meaningful progress; never duplicate the full map here.

## Doc updates — automatic (user will not prompt for this)

Update SESSION_LOG.md (append) and docs/production-status.md (checklist/focus) when ANY of these is true:
1. Before `git commit` if changes include client/src/, server/src/, or server/migrations/
2. When you finish a coding task — before your final reply to the user
3. When the user says ship, done, merge, commit, or PR

Skip only for trivial doc-only typo/comment edits with no behavior change.

SESSION_LOG format: date — title — what shipped — key files — test counts if make test was run.

## Current focus
1. Dark mode: auth pages off zinc-*; theme toggle on login/MFA routes
2. Phase 2: tenant isolation (requireFacilityAccess, repo audit, cross-tenant data tests)

Auth truth order: code + SESSION_LOG > chunk-4 decisions > docs/server.md / README

Commands: prefer make test, make migrate, make start.
