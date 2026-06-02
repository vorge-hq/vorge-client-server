# Vorge Server Build Plan

This document references `plan.md` and `docs/BusinessLogic.md`.

## Backend Architecture

The server is an Express REST API with PostgreSQL persistence, Knex migrations, JWT authentication, server-side authorization, facility isolation, audit logging, and business-rule services.

## API Structure

Initial API modules:

- `/api/auth`
- `/api/assessments`
- `/api/mitigations`
- `/api/admin`

Planned modules include users, facilities, assets, threats, asset-threat links, evaluations, audit/history, notifications, exports, and offline/field-mode endpoints.

## Database Schema Strategy

The first migration creates operators, facilities, users, role assignments, assessments, assets, threats, asset-threat links, evaluations, mitigations, mitigation progress logs, audit log entries, versions, and library entries.

Every assessment-related table includes `facility_id`.

## Migration Strategy

Migrations are explicit through `scripts/migrate.sh` and `npm --prefix server run migrate`. Normal startup does not run migrations or destructive setup.

## Authentication Strategy

Use email/password sign-in, bcrypt password hashing, JWT sessions, password reset foundation, and TOTP MFA-ready design. JWT identifies the user; role and facility access are validated server-side.

## Authorization Middleware Strategy

Middleware validates authentication, acting role, facility scope, and request payloads. Business services remain the authority for workflow and permission rules.

## Facility Isolation Strategy

Facility access is checked in middleware/services and modeled with PostgreSQL row-level security foundations. HQ Executive access is operator-scoped. Cross-facility Admin access must be explicit.

## Assessment State Machine Strategy

`assessmentStateMachine` owns the four-state lifecycle and enforces allowed transitions, required reasons, signature effects, and audit action names.

## Audit Logging Strategy

`auditService` creates immutable append-only entries with stable hashes and previous-hash fields. Persisted audit rows must not be updated or deleted.

## Mitigation Workflow Strategy

`mitigationWorkflowService` enforces Open, In Progress, and Done transitions. Done requires a note and is terminal. Mitigation Owner updates require approved assessment state, assignment, and facility access.

## Admin Configuration API Strategy

Admin APIs expose foundations for users, roles, facilities, threat classifications, risk matrix, libraries, notifications, default teams, mitigation owner pool, MFA policy, and offline policy.

## Test Strategy

Server service tests cover lifecycle transitions, permissions, facility isolation, mitigation transitions, audit entries, risk calculations, and Section 3-7 relationship logic. Coverage is gated at 95% for service modules.

## Security Controls

- Server-side authorization on every mutation.
- Facility scope on all assessment-related records.
- Password hashing.
- JWT secret production guard.
- Safe error responses.
- Audit log for important events.
- Explicit migrations only.
