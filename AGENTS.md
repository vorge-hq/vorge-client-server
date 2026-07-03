# Vorge SRA — Agent Instructions

These rules apply to any AI agent working in this repo (Claude Code, Cursor agents, etc.). Read this file first and treat it as authoritative.

## Canonical sources of truth

When in doubt, defer to these files rather than restating their contents:

- `docs/businesslogic.md` — business behavior, workflow rules, role permissions.
- `docs/api-contract.md` — REST endpoint contracts.
- `docs/server.md`, `docs/client.md` — system-level overviews.

Do **not** edit those four files without an explicit instruction. They are decision artifacts, not implementation notes.

## Architecture quick-ref

Mobile-first, multi-tenant Security Risk Assessment platform.

- **Client** (`client/`) — React 18, Vite, Tailwind, React Router, Vitest. Mounts at `http://localhost:5173`.
- **Server** (`server/`) — Express, Knex, PostgreSQL 16, JWT (`jsonwebtoken`), `bcryptjs`, Zod, Jest + Supertest. Mounts at `http://localhost:4000`.
- **Runtime** — Docker Compose orchestrates `db`, `server`, `client`.
- **Server is the source of truth** for permissions, facility isolation, workflow rules, and audit logging. Never trust client-supplied authorization.

Key directories on the server:

- `server/src/middleware/` — `authenticate.js`, `authorizeRole.js`, `requireFacilityAccess.js`, `validateRequest.js`.
- `server/src/modules/` — `auth`, `admin`, `assessments`, `mitigations`.
- `server/src/repositories/` — data access layer (the place tenant scoping must live).
- `server/src/services/` — business logic; 95% coverage threshold enforced.

Key client auth files:

- `client/src/auth/AuthContext.jsx`
- `client/src/auth/session.js`
- `client/src/routes/ProtectedRoute.jsx`

## Invariants (non-negotiable)

### 1. Multi-tenant isolation is P0

- Every query in `server/src/repositories/` must accept and apply scoping. At minimum `facilityId`; in the future also `tenantId` / `userId` depending on the route.
- Every data route must enforce tenant isolation two ways: `authenticate`, **plus** either `requireFacilityAccess` middleware **or** a repo-scoped getter that returns only in-scope rows (out-of-scope → `null`/`[]` → 404/empty). Use the middleware when the request payload names the facility/operator (the P3-write shape); use the repo-scoped getter for by-id routes where the facility is a property of the loaded resource. Which routes use which is recorded in `docs/decisions/2026-07-03-repo-scoped-facility-access.md` and mechanically enforced by `server/tests/middlewareCoverage.test.js`. Adding a route that touches assessment, mitigation, audit, or asset data without one of these two guards — or adding a payload-facility route to the test's allowlist instead of guarding it — is a defect.
- Cross-tenant data leakage is a P0 security bug. When you touch a repository query, add an integration test that proves Tenant A cannot read Tenant B's data.

### 2. Demo personas are flag-gated

- `demoSession`, `getDemoPersona`, `canDemoSwitchToRole`, `switchDemoRole`, and any demo persona data in `client/src/auth/session.js` and `client/src/auth/AuthContext.jsx` must be gated behind the demo flag — `isDemoEnabled()` (`client/src/auth/demoFlag.js`), which is true only when the build-time env `VITE_ENABLE_DEMO === "true"`. This is deliberately an explicit env flag, **not** `import.meta.env.DEV`: the demo build (`vorge-demo-roles`) ships with the flag on, while the real prod client (`vorge-app`) sets `VITE_ENABLE_DEMO=false`, and a dev testing real auth can turn it off locally.
- **Gate them, do not delete.** Demo flow is still needed for dev environments and product demos.

### 3. Test coverage threshold

- Jest config in `server/package.json` enforces 95% coverage on `server/src/services/**/*.js` across branches, functions, lines, statements.
- Any new service file requires accompanying tests in the same change. Do not lower the threshold to make a build pass.
- Roadmap phase work is additionally bound by `docs/test-specs.md` — the per-phase acceptance tests there are the definition of done. Do not tick a `docs/roadmap.md` item whose spec'd tests don't exist and pass inside `make test`. Do not weaken, skip, or allowlist your way around those tests to make a phase "complete".

### 4. Migrations are explicit

- Run via `make migrate` (which calls `scripts/migrate.sh`). Migrations do not run automatically on app start.
- New migration files live in `server/migrations/` and use the timestamp naming convention shown by `202605020001_initial_schema.js`.
- Migrations must be idempotent and re-runnable where possible.

### 5. No PII in logs

- SRA data is sensitive by design. Never log raw asset names, threat descriptions, mitigation contents, user identifiers, emails, or facility-identifying details.
- Use the audit log (with the action vocabulary defined in `docs/businesslogic.md`) for any record that needs to be auditable. App logs are for operational diagnostics only.

### 6. Secrets discipline

- `.env` is gitignored and must never be committed. Verify with `git status` before any commit.
- `.env.example` is committed but must contain only placeholder values, never real credentials.
- JWT secrets, DB passwords, and any third-party API keys go in environment variables, never in source.

## Build and run commands

Run via the Makefile. Do not bypass it for routine work.

| Command | What it does |
|---|---|
| `make start` | `docker compose up -d` |
| `make stop` / `make restart` / `make logs` | Compose lifecycle |
| `make test` | Runs `scripts/test.sh` (client + server tests) |
| `make build` | Tests, then builds Docker images |
| `make migrate` | Runs `scripts/migrate.sh` |
| `make setup-first` | First-time local environment prep |

For single-side iteration:

- Server: `cd server && npm run dev` (node --watch), `npm test`, `npm run migrate`, `npm run seed`.
- Client: `cd client && npm run dev`, `npm test`.

## Before committing

1. Run `make test`. The Claude Code PreToolUse hook in `.claude/hooks/pre-commit.js` will block commits if it fails, but running it yourself first saves a hook cycle.
2. Confirm `.env` is not in the staged set: `git status`.
3. Prefer small, focused commits. Reviewing a 30-file commit is hard.
4. If the commit touches `client/src`, `server/src`, or `server/migrations`, append `SESSION_LOG.md`, tick/update `docs/roadmap.md`, and update `docs/production-status.md` in the same commit.
5. Doc-update rule is not commit-only: on EVERY meaningful change (finished task, phase progress, decision taken), append `SESSION_LOG.md` and tick `docs/roadmap.md` before the final reply — the user will not prompt for this.

## Known design concerns (queued for senior dev review)

These are flagged but unresolved. Touch them only with explicit instruction:

- Audit log surfacing strategy — filtered per-role recent activity vs full audit log.
- Optimistic concurrency for recall actions when the server lands (race between Author recall-immediate and Reviewer opening).
- Seed data normalization vs denormalized `assessmentState` on mitigations.
- Permission scoping for filtered audit log queries.
- Internal `version` field — clean up or repurpose.

## Production push roadmap

Work happens on `main`. **The execution checklist is `docs/roadmap.md` (P0–P5, 2026-07-03)**; `docs/production-status.md` remains the product-state map. Phase mapping: old Phase 1 = P1 (done), old Phase 2 = P2, old Phase 3 ≈ P0 (infra grounding) + P5 (hardening); P3 adds the write/section API, P4 the AI module. Original phases, for history:

1. **Phase 1 — Real authentication. ✅ Complete.** Real login → JWT → refresh, demo personas gated behind the demo flag, password reset, and TOTP MFA all shipped (auth chunks 0–4). Records: `SESSION_LOG.md`, git tags, `docs/decisions/chunk-4-*`.
2. **Phase 2 — Tenant isolation hardening. ⬅ Next.** Audit every repository for `facilityId` scoping. Add integration tests that prove cross-tenant access returns 403 / 404. Make `requireFacilityAccess` non-optional on all data routes.
3. **Phase 3 — Production hosting.** Managed Postgres, server host, secrets management, error monitoring, audit log retention policy, Vercel envs pointing at the prod API.

## Out-of-scope files

Do not modify these without an explicit instruction in the prompt:

- `Notes.txt` — personal planning file, gitignored.
- `website/` — separate homepage generator, gitignored.
- `docs/businesslogic.md`, `docs/api-contract.md` — canonical sources of truth (see top).
- `.env`, `.env.example` — secrets / env shape changes require human review.
- Migrations already in `server/migrations/` — never edit a shipped migration; add a new one.
