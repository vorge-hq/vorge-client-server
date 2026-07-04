# P3 — Write/Section API · Kickoff & build sequence

**Status:** ACTIVE (started 2026-07-03). This is an execution guide, not a new decision. It sequences already-approved work and points at the binding specs — it does not restate or override them.

## Read these first (in order)
1. **`docs/test-specs.md §P3`** — the binding acceptance tests. An item is "done" only when its spec'd tests exist, run in `make test`, and pass. This is the definition of done.
2. **`docs/decisions/2026-07-03-write-section-api.md`** — the approved contract extension + scope (assets/threats/links/evaluations/contributors/section-text, plus withdraw/recall + Lead Author reassignment + mitigation-assignment). Sign-off recorded there.
3. **`docs/roadmap.md` P3 section** — the checklist to tick.
4. `docs/businesslogic.md` §5/§6 (state machine + write rules) and §17.7 (single-Lead-Author / assessment-level lock). **Do not edit** businesslogic.md or `docs/api-contract.md` — deviations go in `docs/decisions/`.

## Non-negotiable guardrails (carried from P2)
- **RLS is live.** Every `/api/assessments/*` route already runs through `authenticate` + `facilityScope` (the router wires them). Content mutations MUST use `activeConn().transaction(...)` (a savepoint on the request's RLS-scoped connection) — see `src/modules/assessments/routes.js` workflow route for the exact pattern. Do not open `db.transaction` directly. `appendAuditLog` already self-scopes.
- **Route-guard introspection (`tests/middlewareCoverage.test.js`) will fail on any new unguarded data route.** New by-id write routes (`/api/assessments/:id/assets` etc.) carry no `facilityId` in the payload, so they follow the **repo-scoped-getter** pattern (load the assessment via `getAssessmentForUser` → `null` → 404). Add each new method+path to `REPO_SCOPED_ALLOWLIST` in that test with a justification naming the getter. Do NOT add a payload-facility route to the allowlist to dodge the guard. (Two-guard model: `docs/decisions/2026-07-03-repo-scoped-facility-access.md`.)
- **Cross-tenant matrix must extend** (`tests/integration/tenantIsolation.test.js`): every new mutation gets an Op-A-user-vs-Op-B-resource case → 404, target row asserted unchanged. (test-specs §P3 last bullet.)
- 95% services-branch coverage gate holds. `make test` before every commit (run with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test` so integration runs). No `Co-Authored-By` trailers. Update SESSION_LOG + tick roadmap + update production-status on every meaningful change.

## Grounding: what already exists (don't rebuild)
- **`lock_version`** column is already on `assessments` (int, default 1). Optimistic concurrency = assessment-level (per §17.7). `updateAssessmentState` already does the `where({id, state}) ... lock_version + 1` pattern — mirror it for content writes (bump `lock_version` on every content mutation; 409 on mismatch).
- **Schema (from `202605020001_initial_schema.js`):** `assets(name, asset_type, criticality, details jsonb)`, `threats(name, likelihood, details jsonb)`, `asset_threat_links(asset_id, threat_id, enabled)` UNIQUE(asset_id,threat_id), `evaluations(scenario, controls, vulnerabilities, proposed_mitigation, r1 jsonb, r2 jsonb)` UNIQUE(asset_id,threat_id), `assessments.contributors jsonb`. All child tables have `facility_id` + `assessment_id` (RLS-scoped).
- **Section-text SCHEMA GAP:** no column stores Section 1 (Exec Summary) / 2 (Facility Info) / 8 (Conclusion) text. Needs a new migration. **Decision to make at kickoff:** `assessment_sections(assessment_id, facility_id, section_number, content_text, ...)` table (RLS-scoped, cleaner, indexable) vs. JSONB on `assessments`. Recommend the **table** (consistent with the RLS model; a JSONB blob on assessments would need its own scoping story). Record the choice in a decision record.
- **Withdraw/recall already partly modeled:** `assessmentStateMachine.js` has `WITHDRAW_TO_DRAFT` (Author, In Review→Draft, requireReason) and `RECALL_REVIEW_COMPLETION` (Reviewer). The withdraw/recall endpoints ride the existing `POST /:id/workflow` mechanism + `lock_version` — see test-specs §P3 "Withdraw/recall race".
- **Error style:** throw `DomainError(message, status, CODE, details)`. Reuse existing codes where they fit (`INVALID_ASSESSMENT_STATE` 409, `ROLE_NOT_ALLOWED` 403, `ASSESSMENT_NOT_FOUND` 404). Stale `lock_version` → 409 (name it, e.g. `ASSESSMENT_STATE_CONFLICT`/`LOCK_VERSION_CONFLICT` — pick one and be consistent).

## Recommended build sequence
Land (a)+(b)+(c) FIRST — they de-risk the pattern every other endpoint copies.

- **(a) Section-text migration** — new `assessment_sections` table (RLS: enable + add the same `facility_id = ANY(current_setting('app.current_facility_ids'))` policy as migration `202607030002`; add the table to that policy set). Additive + idempotent (test-specs §P3 "Section text": run `migrate:latest` twice). Write a one-line decision record for table-vs-JSONB.
- **(b) Shared write-guard helper** — one reusable unit that every content mutation flows through: load assessment via `getAssessmentForUser` (→404 out-of-scope), assert acting role = Author (→403), assert state = Draft (→409/403 per state machine matrix), check `lock_version` (missing→400, stale→409), then run the write + `appendAuditLog` + `lock_version` bump atomically in `activeConn().transaction`. This is where the six-case ground rules + concurrency + audit-atomicity live once, tested once, reused everywhere.
- **(c) Assets CRUD** as the REFERENCE endpoint (`POST/PATCH/DELETE /api/assessments/:id/assets[/:assetId]`) with the FULL test suite from test-specs §P3: six-case ground rules, `lockVersion.test.js` (incl. the true Promise.all race → exactly one 200 + one 409), state×role matrix, `writeAudit.test.js` (exactly one audit row, correct vocabulary, atomic rollback), cross-tenant extension. Get this green and reviewed before fanning out.
- **(d) Replicate** the pattern to threats, links (PUT enable/disable), evaluations (PATCH), contributors (PUT). Each reuses (b); each extends the concurrency/audit/cross-tenant suites.
- **(e) Section-text endpoints** (`PUT /api/assessments/:id/sections/:n`) — round-trip test (unicode/long/empty), on top of (a).
- **(f) Withdraw/recall + Lead Author reassignment + mitigation-assignment** endpoints (approved into P3 scope) — withdraw/recall race test closes the AGENTS.md known concern.
- **(g) Client flip (RTL)** — prod mode (`VITE_ENABLE_DEMO=false`) fires live API calls with `lockVersion`; 409 renders the exact "modified by another user — reload" copy; demo mode still uses fixtures (assert with a fetch spy). Then flip `client/src/data` prod reads/saves onto live calls.

## When P3 lands
Only then, on explicit instruction, edit `docs/api-contract.md` to document the new endpoints (quote the decision record). P3.5 (Word/PDF export) follows — spec at `docs/test-specs.md §P3.5`.
