# P4 + P4.5 execution plan (binding playbook for build sessions)

**Authored:** 2026-07-04 (Fable session F1) · **Status:** APPROVED — execute in order
**Governs:** P4 (AI module + features) and P4.5 (Platform Console) in `docs/roadmap.md`
**Binding specs:** `docs/test-specs.md` §P4 and §P4.5 · **Standing deviation:** `docs/decisions/2026-07-03-ai-gateway-ai-sdk.md` (AI Gateway + AI SDK; governs over businesslogic §9's Together-AI/YAML mechanism)

---

## How to use this document (read first, every session)

This plan was deliberately authored by a stronger model so that build sessions can execute
**without architectural judgment calls**. Rules for every build session:

1. **Start** by reading this file + `docs/roadmap.md` (P4/P4.5) + the relevant `docs/test-specs.md` section. Do not re-derive design from businesslogic §9 — where §9 and this plan differ, this plan + the gateway decision record govern.
2. **Execute the session order below** (O1 → O9). One session block per session where possible; small commits, `make test` green before each commit.
3. **Escalation rule (binding):** if implementing requires deviating from anything specified here (interface, table shape, guard placement, test spec), do NOT improvise. Append the question to the **Open questions** section at the bottom of this file, leave that thread unfinished, and continue with other in-scope work. Deviations are resolved in a short Fable session.
4. **Two review gates are mandatory:** after O2 and after O8, STOP — do not build the next block on top until the Fable review gate (F2/F3) has run on the diff. Tick the roadmap + append SESSION_LOG as usual.
5. Per CLAUDE.md: never edit `docs/api-contract.md` unless the user explicitly instructs it.

**Model routing (Solo's sessions only):** build sessions (O1–O9) run on **Opus** (`/model opus`). Gates F2/F3 run on **Fable** (`/model fable`) and review ONLY the diff since the previous gate. If Fable is unavailable at a gate, fallback: `/code-review high` plus the adversarial checklist in the gate description — but prefer waiting for Fable. This routing reflects Solo's token budget — the rest of this document (architecture, session order, specs, gates, escalation rule) binds regardless of which model a block runs on.

---

## Session order

| # | Block | Gate |
|---|---|---|
| O1 | Library management CRUD + seeding (prereq for semantic search) | — |
| O2 | AI service module foundation (migrations, `server/src/ai/`, ceilings, audit, entitlements read, `aiImportBoundary` test) | **F2 (Fable) before O3** |
| O3 | Feature 1 — Semantic library search (embeddings + pgvector) | — |
| O4 | Feature 2 — Smart tagging (structured output, controlled vocabulary) | — |
| O5 | Feature 3 — Drafted Executive Summary / Conclusion (§1/§8) | — |
| O6 | Feature 4 — Anomaly detection server engine (AD-2+) | — |
| O7 | Feature 5 — Cross-facility consistency flagging (nightly batch) | — |
| O8 | P4.5 part 1 — `PLATFORM_OWNER` role + provisioning API (`/api/platform/*`) | **F3 (Fable) before O9** |
| O9 | P4.5 part 2 — Owner dashboard + provisioning wizard UI + entitlement toggle + support access | — |

Feature 6 (natural-language search) is **not built** — bespoke, zero v1 hours (§9.5).
Each feature block (O3–O7) ends with: per-feature §P4 tests green → self `/code-review` → commit → roadmap tick.

---

## Architecture (binding)

### Directory layout

```
server/src/ai/                  ← THE AI module. ONLY directory allowed to import `ai` / @ai-sdk/*
  index.js                      ← public API (everything feature code may call)
  gateway.js                    ← the ONLY file importing the AI SDK; createGateway with AI_GATEWAY_API_KEY
  config.js                     ← per-feature model map (env-overridable strings)
  promptContext.js              ← facility-scoped context builder (THROWS on cross-facility entities)
  prompts/                      ← version-controlled prompt templates, one file per feature
server/src/services/aiBudgetService.js   ← PURE logic: cost math, ceiling state (79/80/100), month keys
server/src/services/tagVocabularyService.js ← PURE: vocabulary validation (discard out-of-vocab)
server/src/services/anomalyRulesService.js  ← PURE: deterministic rules (no LLM, no DB)
server/src/repositories/aiRepository.js     ← ai_call_log writes, month-to-date usage sums
server/src/repositories/entitlementsRepository.js ← facility_entitlements reads/writes
server/src/repositories/libraryRepository.js      ← library_entries CRUD + vector search (knex.raw)
server/src/jobs/consistencyFlagging.js      ← nightly batch entry point (npm script `job:consistency`)
```

Rationale: `services/` stays pure (95% coverage gate applies — put all branching logic there);
orchestration + SDK isolation in `src/ai/`; DB in `repositories/`. Matches existing conventions
(`exportService`/`exportRepository` pairing; `contentWriteGuard` audit-spy pattern).

### The module's public API (`server/src/ai/index.js`)

One orchestrating entry point used by ALL features:

```js
runAiCall({
  feature,        // 'drafted_summary' | 'anomaly_detection' | 'smart_tagging' |
                  // 'semantic_search' | 'consistency_flagging'
  kind,           // 'text' | 'object' | 'embedding'  (generateText / generateObject / embed)
  facilityId,     // REQUIRED for facility features; operator features pass operatorId instead
  operatorId,     // set for consistency_flagging (HQ budget scope)
  userId,         // or 'system' for batch jobs
  actingRole, traceId,
  prompt | schema | value,   // per kind
}) → { output, usage } | throws DomainError
```

`runAiCall` performs, in order — every step observable in tests with the gateway mocked:
1. **Entitlement check** (add-on features only: `anomaly_detection`, `consistency_flagging`) — disabled → `DomainError 403 FEATURE_NOT_ENABLED`, **no gateway call, no cost**.
2. **Ceiling check** (month-to-date `SUM(cost_usd)` from `ai_call_log` vs budget): ≥100% → refuse with `cost_ceiling_hit` outcome (audit row still written, `DomainError 429 AI_BUDGET_EXHAUSTED`, other facilities unaffected). ≥80% and `soft_alerted_for_month != current month` → emit alert once (audit row `ai-budget-soft-alert` + console warn; email lands with P5) then proceed.
3. **Rate limit** per facility (in-memory, `express-rate-limit`-shaped; same Redis-swap caveat comment as `middleware/rateLimit.js:13`).
4. **Gateway call** with model string from `config.js`. Transient failure → **exactly one** exponential-backoff retry; second failure → `DomainError 503 AI_TEMPORARILY_UNAVAILABLE` ("AI service temporarily unavailable. Please try again in a few minutes."). **No silent model/provider fallback ever** — assert no second model fired.
5. **Audit write, always** (success AND every failure class) — one `ai_call_log` row with ALL §9.7 fields. `provider`/`model` = what the gateway **reports** (`providerMetadata`/response metadata), falling back to the requested string + `metadata.providerUnverified=true` if absent (decision record consequence #2).

Prompt context: features never assemble entity data directly into prompts — they call
`buildPromptContext({ facilityId, entities })` (`promptContext.js`), which **throws**
`DomainError 500 CROSS_FACILITY_PROMPT` if any entity's `facility_id` differs from the request scope.
The ONLY caller allowed cross-facility is the consistency job, via a separate explicit
`buildOperatorPromptContext({ operatorId, facilities })` that still throws on cross-**operator** data.

### Config (`server/src/ai/config.js` + `config/env.js` additions)

```js
// env.js additions (with boot guards in the existing style):
aiEnabled: process.env.AI_ENABLED === "true",          // default false; features 404 cleanly when off
aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY,        // boot guard: required if aiEnabled && production
// config.js — per-feature model map; env-overridable, NO code change to switch (decision record):
models = {
  drafted_summary:      env.AI_MODEL_DRAFTED_SUMMARY      || "meta/llama-3.3-70b",
  anomaly_detection:    env.AI_MODEL_ANOMALY               || "meta/llama-3.3-70b",
  smart_tagging:        env.AI_MODEL_TAGGING               || "meta/llama-3.3-70b",
  consistency_flagging: env.AI_MODEL_CONSISTENCY           || "meta/llama-3.3-70b",
  embeddings:           env.AI_MODEL_EMBEDDINGS            || "openai/text-embedding-3-small",
}
```

Model strings are gateway `"provider/model"` ids (decision record). Embedding model bound to
`text-embedding-3-small`, **1536 dims** — if this changes later, the re-embedding job (O3) handles it.

### Migrations (knex, `server/migrations/`, next free stamps `202607050001+`)

1. **`ai_call_log`** — dedicated table, NOT rows in `audit_log_entries`. Rationale (binding): §9.7
   fields are structured/queryable (budget accrual = monthly SUM per facility; cost dashboards),
   volume is high, and the hash-chained audit table must stay lean; the §P4 spec's "audit row"
   requirements are satisfied by this table. Columns (explicit, snake_case):
   `id uuid pk, feature text, facility_id uuid null, operator_id uuid null, user_id text ('system' allowed),
   acting_role text null, provider text, model text, input_tokens int, output_tokens int,
   cost_usd numeric(10,6), latency_ms int, outcome text CHECK (success|error|timeout|rate_limited|cost_ceiling_hit),
   error_detail text null, trace_id text, metadata jsonb default '{}', created_at`.
   Index `(facility_id, created_at)` + `(operator_id, created_at)`. Add `facility_isolation` RLS
   policy (same GUC predicate as `202607030002`); operator-scoped rows (facility_id null) are
   written/read only by the system job + platform surfaces — app role access via explicit queries.
2. **`ai_budgets`** — `id, scope text CHECK (facility|operator), scope_id uuid, monthly_usd numeric
   (defaults: facility $50, operator $20 — §19.11), soft_alerted_for_month text null (e.g. '2026-07'),
   unique(scope, scope_id)`. Suspension is **computed** (usage ≥ budget), never stored — month
   rollover then resumes automatically (spec case).
3. **`facility_entitlements`** — `facility_id uuid, feature_key text CHECK
   (anomaly_detection|consistency_flagging|offline_mode), enabled boolean default false,
   updated_by uuid null, updated_at, unique(facility_id, feature_key)`. Base features
   (semantic search, tagging, drafted summaries) are always-on — **no rows**, not `enabled=true` rows.
   RLS policy on it. **DECIDED 2026-07-04: owner-only writes v1** (write surface ships in O9).
4. **O3:** `library_entries.embedding vector(1536)` column (nullable; extension already enabled by
   `202607030001`) + ivfflat/hnsw index if row count warrants (start without; note in migration).
5. **O4:** `tag_vocabulary` (`id, facility_id, category CHECK (threat_type|asset_class|region|consequence_category),
   value, unique(facility_id, category, value)`, RLS) seeded from §19.1 threat classifications +
   asset classes; `scenario_tags` (`evaluation_id fk, tag_value, category, source CHECK (ai|manual),
   status CHECK (suggested|confirmed|removed)`, RLS via evaluation's facility).
6. **O6:** `anomaly_acknowledgements` (`assessment_id, author_user_id, rule_key, entity_type,
   entity_id, reason CHECK (not_applicable|false_positive|will_address|other), reason_text null,
   unique on (assessment_id, author_user_id, rule_key, entity_type, entity_id)`, RLS) — suppression
   is per-Author per-assessment (§9.2).
7. **O7:** `consistency_flags` (`operator_id, facility_id, cluster_key, severity, divergence_sigma numeric,
   rationale text, status CHECK (pending|dismissed|sent_back|expired), dismissed_reason null, created_at`, RLS by facility;
   HQ reads via §17.5 operator-portfolio scope).
8. **O8:** platform tables — see P4.5 section.

### The architectural invariant test (write FIRST in O2)

`server/tests/aiImportBoundary.test.js` (unit loop, no DB): fs-walk `server/src/**` and assert no
file outside `server/src/ai/` imports/requires `ai`, `@ai-sdk/`, `openai`, `@anthropic-ai/`,
`together-ai`, or `voyageai`. This runs on every `npm test` and mechanically enforces §9's rule.

---

## Block details

### O1 — Library management CRUD + seeding

Prereq for semantic search (roadmap: "must land before/with P4 feature 1"). No AI in this block.
- `modules/library/routes.js` (mount `/api/library` in `app.js`; classify in
  `middlewareCoverage.test.js` `DATA_MODULES`): CRUD on `library_entries` for the five library
  types (Scenarios, Mitigations, Vulnerabilities, Controls, Consequences — §12). `authenticate` +
  `facilityScope` + `requireFacilityAccess`; writes Admin-only (`authorizeRole(ROLES.ADMIN)`),
  reads any facility role. Zod schemas in `modules/library/schemas.js`.
- Audit per mutation: `library-entry-created|updated|deleted` (lowercase-hyphen vocabulary, atomic
  savepoint pattern via `appendAuditLog(entry, trx)` like `contentWriteGuard`).
- Seed §19-default library content for the demo/staging seed (`db/seed.js` extension, idempotent
  like the 2026-07-04 seed work).
- Client: Admin library surface is fixtures today — wire reads through the prod↔demo seam only if
  already rendered; otherwise server-only this block (client library management UI is NOT in P4 scope).
- Tests: integration CRUD + role matrix + cross-tenant (extend existing matrix), audit rows.

### O2 — AI service module foundation  → GATE F2

Everything in **Architecture** above: migrations 1–3, `server/src/ai/*`, pure services, repos,
`aiImportBoundary.test.js`, and the §P4 **module unit tests** (gateway fully mocked — mock at the
`gateway.js` seam via `jest.spyOn`, the `contentWriteGuard`/`auditRepository` namespace-import
pattern): ceilings 79/80/100 + fire-once alert + month rollover; full §9.7 field-list assertion;
scoping THROWS; no-silent-fallback; exactly-one-retry; Mitigation Owner 403 matrix (add a shared
`rejectMitigationOwner` guard used by every AI endpoint as they land).
Also in O2: the **entitlements read** is baked into `runAiCall` from day one (roadmap: "plumbing-in,
don't retrofit") — with no write surface yet, seed staging rows by SQL snippet documented in the
migration.
**STOP after O2 — request the F2 Fable review gate** (ceiling math, scoping-by-construction, audit
completeness, no-fallback, RLS on new tables).

### O3 — Feature 1: Semantic library search

- Embedding pipeline: on library entry create/update (O1 endpoints), call
  `runAiCall({kind:'embedding', feature:'semantic_search'})` **async post-commit** (do not block the
  write; failure leaves `embedding` null and logs) and store the vector.
- `GET /api/library/search?q=&type=` — embed the query, cosine similarity via `knex.raw`
  (`embedding <=> $1` pgvector operator), filtered to library type + requester's facility scope,
  top 10 + similarity score. <500ms target (no LLM call at search time).
- Re-embedding script `server/scripts/reembed-library.js` (bulk edits / model upgrades).
- Client: wire the existing library pickers' search through the seam (prod calls endpoint, demo
  keeps fixture filtering; fetch-spy test).
- Tests: §P4 per-feature spec (embedding written on create/update; identical entries in two
  facilities → only requester's returns; deterministic ordering with mocked embeddings).

### O4 — Feature 2: Smart tagging

- Migration 5 (vocabulary + tags). `POST /api/assessments/:id/evaluations/:evalId/suggest-tags`
  (Author + Draft only — reuse `contentWriteGuard` role/state logic; fires async after client save).
- `runAiCall({kind:'object'})` with a Zod schema `{tags: string[]}` (2–4 tags); validate against
  `tagVocabularyService` — **out-of-vocabulary tags discarded**, never persisted.
- Persist `suggested` rows; confirm endpoint flips to `confirmed`. Audit records suggested AND
  confirmed separately (`ai-tags-suggested`, `tags-confirmed`).
- Client: chips UI marked "AI-suggested" below the Section-6 scenario, confirm/remove/add-manual;
  seam + fetch-spy tests. 30s auto-confirm timeout per §9.6.
- Tests: §P4 spec (mock model returns 2 valid + 2 invalid → exactly 2 persist; audit both sets).

### O5 — Feature 3: Drafted Executive Summary / Conclusion

- `POST /api/assessments/:id/sections/:n/generate-draft`, `n ∈ {1,8}` (path fixed by §9.1) on the
  assessments router. Guard: acting role Author AND state != Approved (route-level; also the shared
  Mitigation-Owner 403). Repo-scoped getter or `requireFacilityAccess` per the coverage-test rules.
- Prompt: structured data from Sections 2–7 via `buildPromptContext` → 3–5 paragraphs. Response
  marked "AI-generated, requires human review" client-side.
- **AI original retained**: on generate, write the draft text into the audit row metadata
  (`ai-draft-generated`, `metadata.draftText`) so Approver can compare vs the edited final saved via
  the normal §P3 section-save path. No new storage column.
- Client: "Generate Draft" button on §1/§8 editors (Author + non-Approved only), loading state,
  regenerate; seam + fetch-spy tests (prod fires POST, demo no-fetch).
- Tests: §P4 spec (role/state gating incl. 403 non-Author; original in audit next to edited final).

### O6 — Feature 4: Anomaly detection server engine (AD-2+)

- Migration 6. `POST /api/assessments/:id/anomaly-check` (Author + Draft; client debounces 800ms —
  AD-1 client ack loop shipped 2026-05-29, reuse its UI contract).
- Hybrid engine: deterministic rules in `services/anomalyRulesService.js` (pure, unit-tested —
  R1 math consistency, severity-vs-criticality, criticality-Low-vs-fatality keywords per §9.2) run
  first and free; LLM contextual checks (scenario/threat-type mismatch, mitigation-vs-vulnerability)
  via `runAiCall` **only when entitled** (`anomaly_detection` is an ADD-ON — deterministic rules are
  also gated behind the same entitlement: the whole feature is the add-on).
- Advisory only — NEVER blocks submission. Acknowledge endpoint writes `anomaly_acknowledgements`;
  suppression per-Author per-assessment; every flag/dismissal audited (`anomaly-flagged`,
  `anomaly-acknowledged`) for tuning.
- Tests: §P4 spec (each deterministic rule one positive + one negative; ack suppresses per-Author
  only; disabled entitlement → 403 + no gateway call).

### O7 — Feature 5: Cross-facility consistency flagging

- Migration 7. `server/src/jobs/consistencyFlagging.js` + npm script `job:consistency` (Render cron
  invokes nightly after midnight UTC; document the cron setup in the session log — do not build a
  scheduler).
- Per operator (entitled facilities only): cluster scenarios (same threat type + similar asset
  class), compute peer mean/σ on ratings, flag ≥2σ outliers, generate short prose rationale via
  `runAiCall({feature:'consistency_flagging', userId:'system', operatorId})` (operator budget scope,
  $20/mo default). Store `consistency_flags`.
- Read surface: `GET /api/assessments/consistency-flags` for HQ Executive (operator-portfolio scope
  per §17.5) + dismiss/send-back status updates (audited). Client: HQ dashboard flags panel via the
  seam.
- Tests: §P4 spec (synthetic portfolio with known 2σ outlier → flagged; non-outlier → not;
  operator boundary respected — two operators seeded, no cross-flagging).
- **F2 bindings (2026-07-04):** (a) the job selects ONLY entitled facilities into
  clusters — this is where `consistency_flagging`'s entitlement is enforced (there is
  no per-facility check at an operator-scoped `runAiCall`; §P4 spec has the case);
  (b) the job's DB connection must be able to read/write operator-scoped
  `ai_call_log`/`ai_budgets` rows, which facility RLS denies to the request-path app
  role BY DESIGN — base pool today (owner), an explicitly documented elevated
  connection (own env var) once P2's non-owner switch lands. Document the choice in
  the O7 session log.

### O8 — P4.5 part 1: PLATFORM_OWNER + provisioning API  → GATE F3

Specs: `docs/test-specs.md` §P4.5 (authored 2026-07-04). Decisions bound: support access =
**link-only** (owner self-assigns a normal role via an audited platform grant — NO impersonation/
dual-identity session; matches §17.6 "role flag, not special user type"); entitlement toggle =
owner-only v1.

- **Role:** add `PLATFORM_OWNER: "Platform Owner"` to `services/constants.js` ROLES; add to
  `mfaPolicy.js` `MFA_REQUIRED_ROLES`. **Allowlist:** `PLATFORM_OWNER_EMAILS` env (comma-separated;
  boot guard: non-empty if any platform-owner role assignment exists is NOT checkable at boot —
  instead enforce at authorization time). New `middleware/requirePlatformOwner.js`: acting role is
  Platform Owner AND `req.user.email ∈ allowlist`, else `403 ROLE_NOT_ALLOWED` — BOTH conditions,
  so a stray role assignment without allowlist entry is inert. Role never appears in operator-facing
  user lists (filter in any user-listing surfaces; v1 has none server-side — verify before assuming).
- **Router:** `modules/platform/routes.js` mounted at `/api/platform`. `authenticate` +
  `requirePlatformOwner` router-level. **These routes are cross-tenant by design** — extend
  `middlewareCoverage.test.js` with a `PLATFORM_MOUNTS` class requiring `authenticate` +
  `requirePlatformOwner` (do NOT weaken the existing DATA_MODULES rules). Platform queries are
  **reviewed explicit queries** (repository functions that take no facility GUC — a dedicated
  `platformRepository.js` using the base connection with per-query WHERE clauses; add a code comment
  on each explaining why RLS-bypass is safe). Normal-route RLS/facility scoping untouched.
- **Provisioning:** `POST /api/platform/operators` — ONE transaction: operator → facility(ies) →
  initial Admin user (invite-style: created with a reset token, no password emailed — email lands P5)
  → role assignments → §19 seed defaults (threat classifications, 5×5 matrix, risk bands, libraries)
  → optional `copyLibrariesFromOperatorId`. Mid-failure → nothing persists. One platform audit row
  per provision (`platform-operator-provisioned`) — platform audit rows go in `audit_log_entries`
  with the new facility's id (self-scoped like `appendAuditLog`'s auth path).
- **Support access (link-only):** `POST /api/platform/operators/:id/support-access`
  `{facilityId, role}` grants the owner a normal role assignment (audit `platform-support-access-granted`);
  `DELETE` revokes (`platform-support-access-revoked`). The owner then uses the EXISTING role-switch
  + MFA-at-role-switch machinery and appears in tenant audit under their real user id. No new
  session semantics.
- **STOP after O8 — request the F3 Fable review gate** (RLS non-weakening, allowlist+MFA, txn
  atomicity, platform audit).

### O9 — P4.5 part 2: Console read/UI + entitlement toggle

- `GET /api/platform/overview` — all operators: facility counts, assessments by state, handover
  status (§5.7 flag), stale/blocked engagements (no state change > N days), month-to-date AI spend
  per operator/facility (from `ai_call_log` — the read that makes budgets visible).
- **Entitlement toggle:** `PUT /api/platform/facilities/:id/entitlements` `{featureKey, enabled}` →
  upsert `facility_entitlements` + audit row (`entitlement-toggled`). Read-time gating already live
  since O2 — toggling is immediately effective.
- `GET /api/assessments/capabilities` (or fold into an existing bootstrap read — implementer's
  choice, record it): returns the facility's active/available features so the client
  "Active capabilities" card (`AuthorDashboard.jsx:340-384`, currently hardcoded JSX) renders from
  data via the seam. Demo keeps the hardcoded look via fixtures.
- Client console: minimal owner-facing pages (overview table + provision wizard form + entitlement
  toggles) behind the Platform Owner role — follow the existing dashboard patterns; RTL + fetch-spy
  tests. Keep it plain; this is an internal tool for one user (Alora).
- Tests: §P4.5 remaining cases (toggle audit + read-time effect; overview respects nothing leaking
  to operator roles).

---

## Fable gate checklists (for the F2/F3 sessions)

**F2 (after O2):** ceiling boundary math (79→proceed/no alert, 80→alert once, 100→refuse+audit,
rollover resumes); month key timezone (bind: UTC); every failure path writes `ai_call_log`
(incl. rate_limited + ceiling); `promptContext` throw coverage; retry = exactly one; no fallback;
RLS on `ai_call_log`/`ai_budgets`/`facility_entitlements`; `aiImportBoundary` scan actually walks
all of `server/src` (not just modules); cost accrual query correctness (per-facility AND
per-operator scopes); secrets not logged.

**F3 (after O8):** existing cross-tenant matrix + RLS suites pass UNCHANGED; `requirePlatformOwner`
checks role AND allowlist; MFA enforced for the role; provisioning txn truly atomic (spy-throw
test); platform repo queries reviewed one-by-one (no `SELECT` without an explicit scope rationale);
allowlist parse edge cases (whitespace, case); support-access grant/revoke audited and grants only
normal roles; no operator-facing surface lists the owner.

---

## Open questions (build sessions append here; resolved in Fable sessions)

All three O2 questions **RESOLVED at gate F2 (Fable session, 2026-07-04)**. The
resolutions below are binding; the code for 1 and 3 landed in the F2 gate commit.

1. **Entitlement gate for `consistency_flagging` at operator scope — RESOLVED.**
   The entitlement is a per-facility record by design (`facility_entitlements` has
   no operator scope), so there is nothing to check at an operator-scoped call
   site. Binding: (a) the O7 job enforces the entitlement by selecting ONLY
   entitled facilities into clusters — §P4 test spec extended with that case;
   (b) the silent skip is replaced with an explicit rule in `runAiCall`:
   `consistency_flagging` is the ONLY gated feature allowed to run without a
   `facilityId`; any other gated feature without one throws
   `500 AI_SCOPE_MISSING` (plus a global guard: every call must carry a facility
   OR operator scope — a scopeless call would accrue against nothing).
2. **Operator-scope RLS + connection seam — RESOLVED (design ratified as built).**
   The RLS predicates are CORRECT: the request-path app role must never see
   operator-scoped rows. Operator rows are reached only by out-of-request
   surfaces: the O7 job and the O8 platform repository. Binding on O7 (added to
   its block above): the consistency job runs as a standalone process whose DB
   connection can read/write operator-scoped `ai_call_log`/`ai_budgets` rows —
   the base pool today (owner; RLS-exempt), an explicitly documented elevated
   connection once P2's non-owner switch lands. `aiRepository`'s operator-scope
   paths are called ONLY from that job/platform context. Facility-path helpers
   (`getBudget`/`getMonthToDateCost`/`markSoftAlerted`) are only ever called
   inside request scopes in O3–O6 — ratified; any future batch caller of a
   facility feature must open a facility scope first.
3. **Retry taxonomy — RESOLVED.** Classification lives at the gateway seam
   (`gateway.js isPermanentError` — the only file allowed to know SDK error
   shapes; duck-typed on `statusCode`/`name`, no top-level SDK import).
   PERMANENT = statusCode ∈ {400, 401, 403, 404, 413, 422} or schema-validation/
   invalid-prompt error names → NO retry, `502 AI_CALL_FAILED` ("The AI request
   could not be completed."), audit outcome `error` + `metadata.permanent=true`.
   TRANSIENT = everything else (5xx, 429, timeout, network, unknown) → exactly
   one backoff retry with the same model, then `503 AI_TEMPORARILY_UNAVAILABLE`
   (unchanged). Unknown defaults to transient: one retry is the safe posture.
