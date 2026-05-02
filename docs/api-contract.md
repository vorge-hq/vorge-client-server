# Vantage API Contract Foundation

The server owns this contract. The client consumes it and must not duplicate server authorization logic.

## Error Shape

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {},
    "traceId": "request-trace-id"
  }
}
```

## Auth

### `POST /api/auth/login`

Returns a JWT, user profile, role assignments, and acting role.

### `GET /api/auth/me`

Returns the authenticated user and acting role.

### `POST /api/auth/switch-role`

Switches acting role when the user holds that role. Role switches must be audited by the persistence layer.

## Assessments

### `GET /api/assessments`

Returns facility-scoped assessments visible to the acting role.

### `GET /api/assessments/:assessmentId`

Returns assessment payload, server-computed permissions, and allowed workflow actions.

### `POST /api/assessments/:assessmentId/workflow`

Runs a server-side workflow transition. Invalid role/state/reason combinations return 400, 403, or 409 errors.

## Mitigations

### `GET /api/mitigations/mine`

Returns assigned mitigations and KPI counts for Mitigation Owner workflows.

### `POST /api/mitigations/:mitigationId/log`

Adds a progress note and/or status transition. Done requires a note. Updates are rejected unless the parent assessment is Approved and the user is assigned.

## Admin

### `GET /api/admin/configuration`

Returns available admin configuration surfaces. Requires Admin acting role.

## Contract Rules

- Role names match `docs/BusinessLogic.md`.
- Assessment state names are `Draft`, `In Review`, `Awaiting Approval`, and `Approved`.
- Mitigation status names are `Open`, `In Progress`, and `Done`.
- Every response that drives UI actions should include server-computed permissions or allowed actions.
