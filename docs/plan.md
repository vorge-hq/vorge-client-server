# Vorge Master Implementation Plan

## Product Summary

Vorge is a multi-tenant B2B Security Risk Assessment platform that replaces Word-document-based SRA workflows with structured, multi-user, audit-defensible software. `docs/BusinessLogic.md` is the canonical source for roles, workflows, lifecycle rules, audit behavior, facility isolation, mitigation workflow, field mode, exports, and admin configuration.

## Architecture Overview

The application is split into:

- `client/`: React/Vite/Tailwind mobile-first web app.
- `server/`: Express REST API with PostgreSQL and Knex migrations.
- `scripts/`: guarded build, setup, test, and migration workflows.
- `docker-compose.yml`: local runtime orchestration for `db`, `server`, and `client`.
- `Makefile`: thin developer command interface.

## Client / Server Separation

The server owns authentication, authorization, facility isolation, workflow state, audit logging, validation, and business-rule enforcement. The client renders server-provided permissions and states but never grants authority by hiding or showing UI controls.

## Database Strategy

PostgreSQL is the system of record. Every assessment-related table includes `facility_id` from the first migration. Facility-level isolation is enforced both in application queries and with PostgreSQL row-level security foundations.

## Authentication Strategy

Authentication uses email/password, bcrypt password hashing, JWT sessions, password-reset foundations, and TOTP MFA-ready structure. MFA is required by default for Admin, Approver, and HQ Executive roles.

## Authorization Strategy

Authorization evaluates authenticated identity, acting role, facility assignment, operator scope, assessment state, and ownership/assignment rules. JWTs identify the user only; current role and facility access must be validated server-side.

## Role Model

The six platform roles are:

- Author
- Reviewer
- Approver
- HQ Executive
- Admin
- Mitigation Owner

Users may hold multiple roles and switch acting role. Role switching is audited.

## Assessment Lifecycle Model

The four canonical states are:

- Draft
- In Review
- Awaiting Approval
- Approved

All transitions go through the server state machine. Approved assessment content is frozen except for post-approval mitigation progress through the Mitigation Owner workflow.

## Audit Logging Strategy

Audit entries are immutable and append-only. They capture user, acting role, facility, assessment, action type, entity, diff/metadata, trace ID, timestamp, and hash-chain fields. Sign-ins, failed sign-ins, role switches, workflow transitions, section saves, comments, locks, mitigation updates, admin changes, exports, AI events, offline events, and audit access are logged.

## Test Strategy

Core server business logic is covered by unit tests with a 95% coverage gate for service modules. Client tests cover protected routes, role navigation, assessment state messaging, mitigation validation, offline messaging, and mobile workflow helpers.

## Docker And Local Development

Use:

- `make start` to start Docker services only.
- `make stop` to stop services only.
- `make build` to install dependencies, run mandatory tests, and build Docker images after tests pass.
- `make build-first` for first-time setup plus build.
- `make migrate` for explicit migrations.

## Security-First Principles

- Never trust client permissions.
- Enforce facility access server-side and with database RLS foundations.
- Hash passwords.
- Require strong JWT secrets outside local development.
- Return safe error responses.
- Audit all important mutations and privileged reads.
- Avoid destructive migrations or seed duplication in normal startup.

## Mobile-First Principles

The client uses card-first screens, responsive layouts, full-screen mobile panels, sticky action bars, accessible tap targets, progressive disclosure, and offline/field-mode status messaging. Desktop can enhance with tables and split panes where useful.

## Known Open Questions

The user prompt resolves several `docs/BusinessLogic.md` questions for this build: Lead Author as assessment designation, facility-level dual-role policy defaulting to Warn, Section 3 Type as internal UI field, Section 2 configurable dropdowns, HQ assessment-level comments for Approvers only, Author Withdraw and Reviewer Recall, upload limits, clone semantics, field-mode v1 foundations, standard Word/PDF export, TOTP MFA, 95% server core coverage, 80% client coverage, and Knex.

Items still tracked before irreversible implementation:

- Whether audit hash chaining is mandatory for v1 or hardening.
- Per-facility libraries only versus operator-template inheritance.
- HQ dashboard refresh cadence.
- Per-user notification preferences in v1.
- Workflow variants such as dual approvers or HQ high-risk approval.
- AI provider and obfuscation details.
