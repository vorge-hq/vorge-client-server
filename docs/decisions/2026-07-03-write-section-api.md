# Decision: introduce a write/section API (extends api-contract.md)

**Date:** 2026-07-03 · **Status:** APPROVED (user sign-off 2026-07-03) — `docs/api-contract.md` still unedited; the contract edit happens on explicit instruction when P3 lands. Approved P3 scope additions (same sign-off): withdraw/recall + Lead Author reassignment endpoints (§5.5–5.6) and mitigation-assignment endpoints (§7) ride P3; Word/PDF export pulled forward from P5 to immediately after P3 (roadmap "P3.5"). · **Phase:** P3

## Problem

`docs/api-contract.md` defines read + workflow endpoints only (`GET /api/assessments`, `GET /:id`, `POST /:id/workflow`). There are **no write endpoints anywhere** — every edit in the demo happens client-side against `client/src/data/*` fixtures. In real prod mode an Author cannot save section content. This is the missing core of the product; nothing else on the roadmap makes the platform usable without it.

## Proposed contract extension (P3)

All routes: `authenticate` + `requireFacilityAccess`; Author acting role; assessment state per the state machine (writes rejected on Approved; content writes on Draft, per businesslogic §5/§6); audit entry on every mutation; optimistic concurrency via the existing `lock_version` column (client sends the version it read; mismatch → 409 `ASSESSMENT_STATE_CONFLICT`-style error and the client reloads).

| Area | Endpoints (indicative) |
|---|---|
| Assets (Section 3) | `POST /api/assessments/:id/assets`, `PATCH /api/assessments/:id/assets/:assetId`, `DELETE …` |
| Threats (Section 4) | same shape under `/threats` |
| Asset×threat links (Section 5) | `PUT /api/assessments/:id/links/:assetId/:threatId` (enable/disable) |
| Evaluations (Section 6) | `PATCH /api/assessments/:id/evaluations/:evaluationId` (scenario, controls, vulnerabilities, proposed mitigation, R1/R2) |
| Contributors (Section 9.A) | `PUT /api/assessments/:id/contributors` |
| Section text (Sections 1, 2, 8) | `PUT /api/assessments/:id/sections/:n` — **schema gap:** no column stores Executive Summary / Facility Info / Conclusion text today; needs a new migration (proposed: `assessment_sections` table or JSONB on `assessments`) |

Mitigation edits (Section 7 authoring) ride the evaluation/mitigation repos; the existing `POST /api/mitigations/:id/log` contract is unchanged.

## Notes

- Error shape, role names, and state names follow the existing contract rules verbatim.
- Concurrency granularity: `lock_version` is assessment-level. v1 keeps it assessment-level (single-Lead-Author model per §17.7); field-level locks deferred.
- Client flip: after endpoints land, prod mode moves off fixtures onto live calls; demo mode (`VITE_ENABLE_DEMO=true`) keeps fixtures.
- Relates to the AGENTS.md "known design concerns" item on optimistic concurrency for recall actions — same mechanism, resolved together in P3.

## Sign-off

**Approved by user 2026-07-03**, including the scope additions listed in the status line. The actual `docs/api-contract.md` edit still happens only on explicit instruction, quoting this record.
