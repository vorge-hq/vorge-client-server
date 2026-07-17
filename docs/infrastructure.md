# Infrastructure Runbook — Staging/Production (P0)

Target topology (locked decisions, 2026-07-03):

- **Database:** Supabase — managed Postgres ONLY (no Supabase Auth; custom JWT/bcrypt/MFA stays).
- **API server:** Render web service built from `server/Dockerfile` (long-running process preserves in-memory rate-limit + MFA replay caches; **single instance until Redis lands in P5**).
- **Real client:** NEW Vercel project, `VITE_ENABLE_DEMO=false`, pointing at the Render URL. The existing `vorge-demo-roles` Vercel project stays untouched as the sales demo.

The agent never signs up for services, deploys, or spends money. Every dashboard step below is performed by the user.

---

## 1. Supabase project (user, dashboard)

1. Log in at https://supabase.com/dashboard → **New project**.
2. Organization: yours. Name: `vorge-staging` (recommended — treat this environment as staging until customers exist). Database password: generate a strong one and store it in your password manager — you cannot retrieve it later, only reset.
3. Region: pick closest to your Render region (recommend both in EU-West/Frankfurt or both US-East — keep API↔DB latency low; pick one pair and match them).
4. Wait for provisioning, then go to **Project Settings → Database** (or the **Connect** button, top of dashboard).

### Connection strings — pooled vs direct (this matters)

Supabase exposes three ways in:

| Use | String | Notes |
|---|---|---|
| **App at runtime** (`DATABASE_URL` on Render) | **Transaction pooler** (Supavisor), port **6543**, host `aws-0-<region>.pooler.supabase.com` | IPv4-friendly (Render egress is IPv4). Transaction mode: no session state between queries — fine for Knex/pg simple queries. |
| **Migrations + seed** (`MIGRATE_DATABASE_URL`, run from your machine) | **Direct connection**, port 5432, host `db.<ref>.supabase.co` — or the **session pooler** (port 5432 on the pooler host) if your network lacks IPv6 | Migrations want a plain long-lived session. Direct host is IPv6-first; on most home networks/macOS it works. If it doesn't, use the session pooler string. |
| Ad-hoc SQL | Supabase SQL editor in the dashboard | Used for enabling extensions, sanity queries. |

Copy both strings (with the password filled in). Keep `?sslmode=require` if present — the server's knex production config will also force SSL.

### Enable pgvector

Dashboard → **Database → Extensions** → search `vector` → enable (schema `extensions` is fine). The repo will ALSO carry an idempotent `CREATE EXTENSION IF NOT EXISTS vector;` migration so other environments (local Docker with a pgvector-capable image, future prod) converge.

## 2. Server config changes (landed in P0, 2026-07-03)

- `server/knexfile.js` (knex CLI/migrations only): prefers `MIGRATE_DATABASE_URL` over `DATABASE_URL`; SSL (`rejectUnauthorized: false`, CA pinning deferred to P5) when `NODE_ENV=production` or `DATABASE_SSL=true`.
- `server/src/db/knex.js` (app + seed runtime): SSL driven by `DATABASE_SSL` (defaults ON in production, OFF elsewhere).
- `COOKIE_SAME_SITE` env (default `strict`; boot guard rejects invalid values and `none` without Secure) now drives the refresh + MFA-trust cookies.
- Migration `202607030001_enable_pgvector.js` (`CREATE EXTENSION IF NOT EXISTS vector`, warn-and-continue where unavailable); local `docker-compose` db image switched to `pgvector/pgvector:pg16`.
- `.env.example` additions go to the user as a diff for human review (AGENTS.md rule).

## 3. Environment variables

### Server (Render → Environment)

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Activates boot guards (rejects placeholder secrets). |
| `SERVER_PORT` | `4000` | Dockerfile EXPOSEs 4000; set Render port accordingly. |
| `DATABASE_URL` | Supabase **transaction-pooler** string (port 6543) | App runtime. |
| `CONSISTENCY_JOB_DATABASE_URL` | Supabase **direct/session** string as an **owner** role (same shape as `MIGRATE_DATABASE_URL`) | **Render Cron Job only** (P4 O7 nightly consistency job), not the web service. The job runs outside any request so it sets no RLS facility context; on the non-owner `vorge_app` role RLS hides every entitled facility and the job silently flags nothing. It refuses to start unless the role is owner/BYPASSRLS. Create the cron only after O9 ships the entitlement toggle. |
| `JWT_SECRET` | fresh `openssl rand -base64 32` | Never reuse dev values. |
| `MFA_ENCRYPTION_KEY` | fresh `openssl rand -base64 32` | Must decode to exactly 32 bytes (boot guard enforces). |
| `JWT_EXPIRES_IN` | `15m` (default) | |
| `REFRESH_TOKEN_EXPIRES_IN` | `30d` (default) | |
| `PASSWORD_RESET_TOKEN_EXPIRES_IN` | `1h` (default) | Email delivery still stubbed until P5. |
| `BCRYPT_ROUNDS` | `12` | |
| `CORS_ORIGIN` | `https://<new-client>.vercel.app` | Exact origin, no trailing slash. |
| `APP_BASE_URL` | `https://<new-client>.vercel.app` | Used in reset links. |
| `COOKIE_SECURE` | (unset) | Defaults true when NODE_ENV=production. |
| `COOKIE_SAME_SITE` | `none` | New in P0; required cross-site (Vercel client ↔ Render API). |
| `DATABASE_SSL` | (unset) | Defaults true when NODE_ENV=production; set `false` only for local. |
| `MFA_ENFORCEMENT_ENABLED` | `true` (default) | |

Generate the two secrets locally: `openssl rand -base64 32` (run twice — one value each). Do NOT put them in `.env` in the repo working tree if you can avoid it; paste straight into Render.

### Migrations/seed (your local shell, one-off)

`MIGRATE_DATABASE_URL` (or `DATABASE_URL` until the knexfile change lands) = Supabase **direct/session** string. Never committed anywhere.

### Client (new Vercel project → Settings → Environment Variables, Production scope)

| Var | Value |
|---|---|
| `VITE_ENABLE_DEMO` | `false` |
| `VITE_API_BASE_URL` | `https://<render-service>.onrender.com` (no trailing slash) |

## 4. Migrate + seed against Supabase (user, local shell)

**Env split (2026-07-16):** repo-root `.env` = local Docker only (one `DATABASE_URL` → Compose `db`). Staging URLs live only in gitignored `.env.staging`. Docker / `make start` never load `.env.staging`. A second `DATABASE_URL` in `.env` overrides the local one and empties the prod-mode assessments list.

```bash
# Local Docker DB:
make migrate
make seed

# Staging Supabase (prompts you to type "staging"; or CONFIRM_STAGING=yes):
# Put MIGRATE_DATABASE_URL + DATABASE_URL in .env.staging first.
make migrate-staging
make seed-staging    # demo password VorgeDemo123!
```

Notes:
- Migrations are explicit — nothing runs on app start (AGENTS.md invariant).
- Seed is upsert-based (idempotent) and creates staging demo data; fine for staging, revisit before real customer data.
- `make migrate` / `make seed` refuse a `supabase.com` host (guards against a polluted `.env`).
- Verify in Supabase Table Editor: `operators`, `facilities`, `users` populated; `knex_migrations` lists all migrations.

## 5. Render web service (user, dashboard)

1. https://dashboard.render.com → **New → Web Service** → connect the GitHub repo (read access only; you can disable auto-deploy after creation if you want manual-only, mirroring the Vercel demo pattern — **recommend: leave auto-deploy OFF** for consistency with the intentional no-auto-deploy stance).
2. **Language/Runtime: Docker.** Root directory: `server` (the Dockerfile is `server/Dockerfile` with context `server/`).
3. Instance type: Starter is fine for staging. **Instance count: 1** (in-memory rate-limit + MFA replay caches; do not scale out before Redis in P5).
4. Region: match your Supabase region choice.
5. Add all server env vars from §3. Render sets `PORT` automatically — the app reads `SERVER_PORT`; set `SERVER_PORT=4000` AND Render's port detection should pick up 4000 from EXPOSE; if health checks fail, set Render's "Port" to 4000 explicitly.
6. Health check path: `/health`.
7. Create service → wait for build → verify `https://<service>.onrender.com/health` returns `{"status":"ok","service":"vorge-server"}`.
8. Smoke auth: `curl -X POST https://<service>.onrender.com/api/auth/login -H 'Content-Type: application/json' -d '{"email":"adaeze.okeke@operator-a.example","password":"VorgeDemo123!"}'` → expect a token payload.

## 6. New Vercel client project (user, dashboard/CLI)

Keep `vorge-demo-roles` untouched. Create a separate project:

1. https://vercel.com/new → import the same GitHub repo (or `vercel link` a second project from a separate checkout — dashboard import is simpler since `.vercel/` in the repo is linked to the demo project).
2. Project name: `vorge-app` (recommended). **Root Directory: `client`**. Framework preset: **Vite**.
3. Environment variables (Production): `VITE_ENABLE_DEMO=false`, `VITE_API_BASE_URL=https://<render-service>.onrender.com`.
4. **Disable git auto-deploy** (Settings → Git) to mirror the demo project's intentional manual-deploy pattern, then deploy manually: from repo root, `vercel --prod --cwd client` won't work with the repo-root `.vercel/` link — instead use the dashboard "Deploy" button, or link the new project in a second clone. (Simplest: dashboard-triggered deploys.)
5. After first deploy, copy the production URL into Render's `CORS_ORIGIN` + `APP_BASE_URL` if you created Render first with a placeholder.

## 7. End-to-end staging smoke (user)

1. Open `https://<vorge-app>.vercel.app` → should show the PROD login (no demo role picker).
2. Log in as `adaeze.okeke@operator-a.example` / `VorgeDemo123!` → dashboard renders from live API data.
3. Leave the tab idle past 15 min → next action silently refreshes (verifies cross-site cookie fix; if you bounce to /login, `COOKIE_SAME_SITE` isn't taking effect).
4. Enroll MFA on a test user; verify trusted-device flow.
5. Known gap (expected): section editing does not persist — write API is P3.

## Deferred / watch items

- Redis (rate-limit + MFA replay) before instance count > 1 — P5.
- CA-pinned DB TLS (replace `rejectUnauthorized: false`) — P5.
- Custom domains (app + api on one apex would allow `SameSite=strict` again) — optional, post-P0.
- Supabase backups/PITR verification against §18.5 (daily, 30-day, PITR 7 days) — P5; Pro plan required for PITR.
