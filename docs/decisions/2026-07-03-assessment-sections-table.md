# Decision: store narrative section text in a table, not JSONB on `assessments`

**Date:** 2026-07-03 · **Status:** DECIDED · **Phase:** P3 (slice (a), per `docs/p3-kickoff.md`)

## Context

Sections 1 (Executive Summary), 2 (Facility Information), and 8 (Conclusion) are free narrative text with no storage today — they lived only in `client/src/data` fixtures. P3 needs a persistence target. The kickoff flagged the choice: a dedicated `assessment_sections` table vs. a JSONB column on `assessments`.

## Decision

New table **`assessment_sections(id, facility_id, assessment_id, section_number, content_text, timestamps)`**, `UNIQUE(assessment_id, section_number)`, migration `202607030003_assessment_sections.js`.

## Why (over JSONB on `assessments`)

- **RLS consistency.** Every other content table is facility-scoped by the uniform `facility_id = ANY(current_setting('app.current_facility_ids'))` policy. The table carries `facility_id` and gets the identical policy for free (same `PREDICATE` as `202607030002`). A JSONB blob on `assessments` would inherit the assessment row's scope but have no independent scoping story and would muddy the "every content mutation flows through the write-guard on its own row" model.
- **Concurrency granularity stays clean.** Optimistic concurrency is assessment-level via `lock_version` (§17.7). A section write bumps `lock_version` exactly like an asset write — uniform through the write-guard — instead of a read-modify-write on a shared JSONB object that would need its own merge handling.
- **Additive + idempotent.** New table guarded by `hasTable`; RLS policy via DROP-then-CREATE. `migrate:latest` twice is a no-op (test-specs §P3 "Section text").

## Scope note

Section numbers follow the businesslogic §-numbering (1, 2, 8 are the narrative sections). The table can hold any section number; endpoints (`PUT /api/assessments/:id/sections/:n`, slice (e)) validate `n` against the allowed narrative set.
