# Vantage SRA

Vantage SRA is a mobile-first, multi-tenant Security Risk Assessment platform. It replaces Word-document-based SRA workflows with a structured, multi-user, audit-defensible client/server application.

`docs/BusinessLogic.md` is the canonical source for business behavior.

## Quick Start

```bash
cp .env.example .env
make start
```

Open:

- Client: `http://localhost:5173`
- Server health: `http://localhost:4000/health`

## Stack

- Client: React, Vite, Tailwind CSS.
- Server: Node.js, Express, PostgreSQL, Knex, JWT.
- Runtime: Docker Compose.

## Commands

```bash
make start
make stop
make logs
make test
make build
```

`make start` only starts Docker services. `make build` runs tests before building Docker images.

## Local environments

The client picks between two modes at runtime via the `VITE_ENABLE_DEMO` flag. The flag lives in `client/.env.development` for local non-docker work, or is exported from the Make target for the Docker stack.

```bash
make dev-demo   # VITE_ENABLE_DEMO=true  — role picker + persona switcher (current demo UX)
make dev-prod   # VITE_ENABLE_DEMO=false — real login form, no demo personas on the client
```

The demo personas (Adaeze, Mei-Lin, Rafael, Sarah, Olivia, Marcus on `@vantage.local`) exist only on the client — they are never seeded into the database. `make dev-prod` against the local DB will only accept the seeded users from `server/src/db/seed.js`:

| Name | Email | MFA |
|---|---|---|
| Adaeze Okeke | `adaeze.okeke@operator-a.example` | enabled |
| Mei-Lin Tanaka | `meilin.tanaka@operator-a.example` | enabled |
| Rafael Castellanos | `rafael.castellanos@operator-a.example` | enabled |
| Sarah Chen | `sarah.chen@operator-a.example` | enabled |
| Olivia Bennett | `olivia.bennett@operator-a.example` | enabled |
| Marcus Johnson | `marcus.johnson@operator-a.example` | disabled |

All seeded users share the password `VantageDemo123!`. MFA enforcement is not wired client-side yet — `make dev-prod` accepts the seeded password and lands you on the role's home route.

## Notes

- Do not use `.env.example` defaults in production.
- The server owns permissions, facility isolation, workflow rules, and audit logging.
- Migrations are explicit via `make migrate`.
