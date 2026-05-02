# Vantage

Vantage is a mobile-first, multi-tenant Security Risk Assessment platform. It replaces Word-document-based SRA workflows with a structured, multi-user, audit-defensible client/server application.

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

## Notes

- Do not use `.env.example` defaults in production.
- The server owns permissions, facility isolation, workflow rules, and audit logging.
- Migrations are explicit via `make migrate`.
