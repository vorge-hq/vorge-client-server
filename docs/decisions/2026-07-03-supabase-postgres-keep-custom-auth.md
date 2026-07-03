# Decision: Supabase as managed Postgres only — keep custom auth

**Date:** 2026-07-03 · **Status:** LOCKED (user decision) · **Phase:** P0

## Decision

- Production/staging database is **Supabase**, used strictly as managed Postgres. `DATABASE_URL` points at it; the `vector` (pgvector) extension is enabled there.
- **Custom auth stays**: email/password + bcrypt + JWT + rotating refresh tokens + TOTP MFA (Phase-1 chunks 0–4). **Supabase Auth is explicitly NOT adopted** — doing so would discard the completed, tested Phase-1 auth stack and its audit integration.
- Connection split: **transaction pooler** (Supavisor, port 6543) for the app at runtime; **direct/session connection** for migrations and seed.
- Knex production config gains SSL (`rejectUnauthorized: false` initially; CA pinning deferred to P5 hardening).

## Why

- Managed Postgres with backups/PITR, pgvector support out of the box (needed for P4 semantic search), zero-ops for a one-developer team.
- No rework: the server already speaks plain Postgres via Knex; only connection config changes.
- Supabase Auth would conflict with the bespoke audit/MFA/session-revocation requirements already built and specced in businesslogic §4.

## Consequences / constraints

- Supabase client libraries, Supabase Auth, and Supabase RLS-via-auth.uid() patterns are all out of scope. P2 RLS policies must be keyed on app-set transaction-local settings (`SET LOCAL` via `set_config`), because the app connects as a single DB role through a transaction pooler.
- The app's DB role must be a non-owner role for RLS to apply (owners bypass RLS unless `FORCE ROW LEVEL SECURITY`) — P2 work item.
- Render↔Supabase networking: Render egress is IPv4; the Supabase direct host is IPv6-first → the app must use the pooler string. Migrations run from the developer machine on the direct/session string.

## Related

- `docs/infrastructure.md` (runbook), `docs/roadmap.md` P0 + P2.
- New env vars: `MIGRATE_DATABASE_URL`, `COOKIE_SAME_SITE` (cross-site cookie fix is part of P0; see roadmap).
