# Vantage Server Architecture

## Overview

The Vantage server is an Express REST API backed by PostgreSQL. It enforces the business rules in `docs/BusinessLogic.md`, including authentication, authorization, facility isolation, assessment lifecycle, audit logging, mitigation workflow, and admin configuration foundations.

## API Modules

- `auth`: login, current session, role switching.
- `assessments`: assessment listing, workspace payloads, workflow actions.
- `mitigations`: My Mitigations and progress updates.
- `admin`: configuration surfaces.

Future modules should split users, facilities, assets, threats, evaluations, audit/history, notifications, exports, and offline field mode into dedicated route/service folders.

## Database Schema Overview

The initial migration creates:

- operators
- facilities
- users
- role assignments
- assessments
- assets
- threats
- asset-threat links
- evaluations
- mitigations
- mitigation progress logs
- audit log entries
- versions
- library entries

Assessment-related rows include `facility_id` from the first migration.

## Migration Approach

Knex owns migrations. Migrations run only through `scripts/migrate.sh` or `npm --prefix server run migrate`. Normal `make start` does not run migrations.

## Authentication Approach

Authentication uses email/password, bcrypt password hashing, and JWT sessions. Password reset and TOTP MFA are scaffolded as architecture requirements for follow-on implementation.

## Authorization Approach

Authorization is server-side. JWTs identify the user, while current role assignments, acting role, facility scope, assessment state, and ownership rules are validated by middleware and services.

## Audit Logging

`auditService` creates immutable entries with stable hashes and previous-hash fields. Persisted audit rows should be append-only and never updated or deleted by application roles.

## Testing

Server tests currently focus on core services: workflow, permissions, facility access, mitigation workflow, risk matrix, audit logging, and Section 3-7 relationship rules. Service coverage is gated at 95%.

## Environment Variables

- `SERVER_PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `DATABASE_URL`
- `BCRYPT_ROUNDS`
- `CORS_ORIGIN`

Production must not use `.env.example` secret defaults.

## Security Decisions

- The client is never trusted for permissions.
- Facility isolation is enforced in services and modeled with PostgreSQL RLS foundations.
- Approved assessment content is immutable except allowed mitigation progress.
- Mitigation Owner updates require assignment and approved state.
- Safe error responses include trace IDs where possible.

## Known Limitations

- Route modules are currently foundation-level and use demo data where persistence is not yet wired.
- RLS policies are enabled as schema foundations; complete session-aware policies should be added with the database access layer.
- Full MFA, password reset, exports, notifications, AI, and offline sync are scaffolded but not complete.
