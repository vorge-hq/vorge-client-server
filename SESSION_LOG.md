2026-07-04 — feat: P4 O4 — smart tagging (structured output + controlled vocabulary)
  Feature 2 of the P4 AI features. Gateway mocked in tests; no network in CI.
  - Migration 202607050005: tag_vocabulary (facility-scoped controlled vocabulary
    in four categories: threat_type|asset_class|region|consequence_category;
    unique(facility, category, value)) + scenario_tags (evaluation-scoped;
    source ai|manual, status suggested|confirmed|removed; facility_id denormalized
    for RLS exactly as mitigations carries it; unique(evaluation, category, value)).
    Both RLS by the standard facility GUC predicate + CHECK constraints.
  - Pure services/tagVocabularyService.js: validateTags DISCARDS out-of-vocab
    strings (case/whitespace-insensitive match → canonical {category,value}),
    DEFAULT_VOCABULARY + defaultVocabularyRows seeded from §19.1/§6.3/§19.5.
  - src/ai/prompts/smartTagging.js: buildTaggingPrompt + zod TAG_OUTPUT_SCHEMA
    ({tags:string[]}); zod only, no SDK import (aiImportBoundary still green).
  - repositories/tagRepository.js: getVocabulary, listTagsForEvaluation,
    saveSuggestedTags (clears prior AI suggestions, never demotes confirmed),
    confirmTags (removes de-selected + upserts chosen→confirmed), seedVocabulary
    (idempotent; reused by db/seed.js now and O8 provisioning later).
  - Routes on the assessments router: POST .../suggest-tags (Author+Draft via a
    NEW reusable loadWritableAssessment extracted from contentWriteGuard — same
    404/403/409 gate WITHOUT the lock_version bump, since tags are advisory
    metadata firing after the save; rejectMitigationOwner; buildPromptContext
    scope invariant; 404 when AI off) → runAiCall({kind:'object'}) → validate →
    persist suggested + audit ai-tags-suggested. POST .../tags/confirm re-validates
    the submitted set against the vocabulary and persists confirmed + audit
    tags-confirmed (SEPARATE row). GET .../tags for hydration.
  - db/seed.js: seedVocabulary for the two demo facilities (idempotent).
  - Client: sections/ScenarioTags.jsx chips under the §6 scenario field —
    "AI-suggested" dashed chips, remove/add-manual (category select + value),
    Confirm, and a 30s auto-confirm timer (§9.6; duration injectable for tests).
    WorkspaceContext seam: suggestScenarioTags/confirmScenarioTags/loadScenarioTags
    (prod hits endpoints scoped to the active assessment; demo canned + no fetch)
    + assessmentApi wrappers (no lockVersion). middlewareCoverage allowlist +3.
  - Tests: smartTagging.test.js integration (2 valid + 2 invalid → exactly 2
    persist; suggested & confirmed audited separately; non-Author 403, non-Draft
    409, Mitigation Owner 403, cross-tenant 404, no gateway call on any reject) +
    smartTagging seam fetch-spy + ScenarioTags component RTL. tagVocabularyService
    unit. 379 unit / 163 integration / 198 client (was 366/152/190).
  Verification: exercised end-to-end through supertest against real Postgres with
  the gateway mocked (the live gateway needs AI_ENABLED + a real key). Next: O5.

2026-07-04 — feat: P4 O3 — semantic library search (embeddings + pgvector)
  Feature 1 of the P4 AI features. Gateway mocked in tests; no network in CI.
  - Migration 202607050004: library_entries.embedding vector(1536) (nullable; no
    ANN index yet — exact scan is well under the <500ms target at demo scale).
  - Embedding pipeline (server/src/ai/libraryEmbedding.js): on library create /
    text-change update the route fires an ASYNC POST-COMMIT embed (registered
    synchronously in `pending`, work gated on res "finish"/"close" so it runs
    after the write commits and its own facility scope sees the row). Never
    blocks or fails the write; re-embeds only when title/body changed; no-op when
    AI off. drainEmbeddings() test seam.
  - GET /api/library/search?facilityId=&q=&type= — embeds the query (audited +
    budgeted; no chat call) then cosine `<=>` ranks the facility's entries
    (RLS + explicit filter), top 10 + similarity. 404 when AI disabled. Route
    registered before /:id.
  - libraryRepository: setEmbedding (facility-scoped, stale-write guard on
    title/body), searchByEmbedding, listEntriesForEmbedding, toVectorLiteral
    (dim + finite-number validation). scripts/reembed-library.js backfill
    (`npm run reembed`; scopes its read so it works under the non-owner role).
  - Client: LibraryModal wired through the prod↔demo seam — WorkspaceContext
    searchLibrary (demo ranks fixtures locally, prod hits the endpoint via
    api/adapters toLibraryPickerEntry), debounced async in the modal. fetch-spy
    seam test (librarySearch.test.jsx).
  - Self-review (finder agent) folded in 4 fixes before commit: deterministic
    drain (sync registration + wait-for-commit), reembed read scoped under RLS,
    stale-embedding guard on concurrent edits, finite-number vector validation.
  - Tests: tests/integration/librarySearch.test.js (embedding-on-create/update,
    metadata-only-no-reembed, cross-facility isolation, deterministic ordering,
    type filter, per-search audit row, 403, 400) + library.test.js AI-off 404 +
    tests/aiLibraryEmbedding.test.js unit + client seam test.
  - Key files: server/migrations/202607050004, server/src/ai/libraryEmbedding.js,
    server/src/modules/library/{routes,schemas}.js, server/src/repositories/
    libraryRepository.js, server/scripts/reembed-library.js, client
    api/assessmentApi + adapters + WorkspaceContext + modals/LibraryModal.
  - make test: 367 unit / 152 integration / 190 client green.

2026-07-04 — review(F2): Fable gate on P4 O2 — PASSED; 3 open questions resolved
  Reviewed ONLY the O2 diff (c5ca72d) against the F2 checklist. All items verified:
  ceiling boundary math (79/80/100 + once-per-month latch + rollover, pinned in
  tests); month key bound UTC end-to-end (timestamptz + single-clock created_at);
  every failure class writes ai_call_log (rate_limited + ceiling included);
  promptContext throw coverage; retry exactly-one/same-model/no-fallback;
  RLS + CHECKs live-verified on all 3 tables; aiImportBoundary non-vacuous
  (breadth + positive-control assertions); accrual query correct per scope;
  secrets not logged (safeError message-only). Ratified: entitlement denial
  writes NO ai_call_log row (outcome vocabulary excludes it; 403 before spend);
  logCall's GUC self-set narrowing = accepted appendAuditLog precedent.
  - Resolutions (binding, recorded in the playbook Open questions + O7 block):
    (1) consistency_flagging entitlement enforced by O7 job's entitled-facility
    selection; explicit runAiCall rule — only consistency_flagging may run
    operator-scoped, any other gated feature without facilityId throws 500
    AI_SCOPE_MISSING, plus a global no-scope guard. (2) Operator-row RLS design
    ratified as built; O7 job must use an elevated/base connection for operator
    rows (bound in the O7 block). (3) Retry taxonomy: isPermanentError at the
    gateway seam (duck-typed statusCode/name, no top-level SDK import) —
    permanent 4xx/validation → NO retry, 502 AI_CALL_FAILED, audit
    metadata.permanent=true; unknown defaults to transient.
  - Code landed at the gate: gateway.js classifier + aiPermanent tagging,
    runAiCall scope guards + permanent short-circuit; tests aiGatewayClassify
    (new) + 4 runAiCall cases; test-specs §P4 extended (permanent/scope-guard
    bullets + entitled-clustering case in the consistency line).
  - O3 (semantic search) cleared to build on Opus.
  - make test: 359 unit / 143 integration green.

2026-07-04 — feat(server): P4 O2 — AI service module foundation (→ F2 gate)
  Built the whole AI module per the p4-execution-plan Architecture section; gateway
  fully mocked, no network in CI. STOP here — F2 Fable review gate before O3.
  - Migrations (RLS'd, applied to vorge_test): ai_call_log (dedicated §9.7 audit +
    cost-accrual table, outcome CHECK, facility/operator indexes), ai_budgets (scope
    CHECK, computed suspension, soft_alerted_for_month latch), facility_entitlements
    (feature_key CHECK anomaly_detection|consistency_flagging|offline_mode, owner-only
    writes v1 — write surface O9; staging seed snippet in the migration).
  - server/src/ai/: index.js runAiCall (5 ordered steps — entitlement → ceiling →
    rate limit → gateway+exactly-one-retry → audit-always); gateway.js (ONLY SDK
    importer, lazy-loads `ai`/@ai-sdk/gateway so the ESM package never breaks the CJS
    unit suite); config.js (env-overridable model + price map); promptContext.js
    (throws CROSS_FACILITY_PROMPT / CROSS_OPERATOR_PROMPT); rateLimiter.js (in-memory,
    Redis-swap caveat). Pure services/aiBudgetService.js (monthKey UTC, computeCost,
    evaluateCeiling 79/80/100 — 100% coverage). repositories aiRepository (logCall +
    month-to-date SUM + budget/soft-alert) + entitlementsRepository (read-only for now).
    middleware/rejectMitigationOwner (shared 403 guard for AI endpoints as they land).
  - provider/model recorded = what the gateway REPORTS, else requested string +
    metadata.providerUnverified (decision-record consequence #2). No silent model
    fallback — retry reuses the SAME model, asserted.
  - Tests (all mocked-gateway / no-DB unit): aiRunCall, aiBudgetService, aiPromptContext,
    aiRejectMitigationOwner, aiRepository (fake-conn full §9.7 column assertion),
    aiImportBoundary (fs-walk, non-vacuous). Config: env.js AI_* + boot guard; .env.example.
  - Self-review (2 parallel finder agents + verify) → 5 fixes folded in before commit:
    cost keys off the requested-model price when the gateway reports a variant id
    (was silently using the $1/$1 default); soft-alert emission is best-effort
    (a bookkeeping hiccup no longer fails the AI call); embedding path now passes
    providerMetadata through (was always providerUnverified); exhausted-budget error
    is scope-neutral (not "this facility") for operator scope; created_at threaded
    from the same `now` as monthKey (single-clock accrual). Migrations: onDelete
    RESTRICT (was SET NULL — mirrors audit_log_entries), CHECK exactly-one-scope on
    ai_call_log, CHECK monthly_usd>0 on ai_budgets.
  - Open questions logged for F2: (1) consistency_flagging entitlement at operator
    scope (no facilityId); (2) HIGH — operator/platform-row RLS + the owner/elevated
    connection seam O7/O8 must establish (inert today: app pool is still owner);
    (3) retry taxonomy (transient vs permanent errors). See p4-execution-plan Open questions.
  - Key files: server/migrations/202607050001-3, server/src/ai/*, server/src/services/
    aiBudgetService.js, server/src/repositories/ai*.js, server/src/middleware/
    rejectMitigationOwner.js, server/tests/ai*.test.js.
  - make test: 336 unit / 143 integration green (was 272/143 at O1 close; +64 unit).
    Client untouched (O2 is server-only). RLS + cross-tenant suites pass unchanged.

2026-07-04 — docs(P6): Fable spec session — Offline / Field mode architecture + execution playbook
  Design-only session (same Fable-specs/Opus-builds split as P4). Resolved the standing
  businesslogic §8 vs roadmap "defer until customers ask" conflict: field mode ships as
  P6, a paid per-facility add-on (offline_mode entitlement), build after P4.5.
  - Decisions (user-approved): WHOLE-ASSESSMENT exclusive checkout supersedes §8's
    per-section model (sections are workflow stages, not specialist territories —
    future granularity is domain-scoped, customer-driven); offline auth v1 = PIN-only
    (PBKDF2/AES-GCM cache encryption; biometric + tamper counters v2); deviceEditAt
    rides audit metadata (server created_at never backdated — hash chain intact);
    photos out of v1 (no attachments feature exists online); §8.4 read-only fallback
    + PWA shell are FREE tier; sync is never entitlement-blocked (no stranded data).
  - Architecture: checkout freezes lock_version so sync replays through the existing
    contentWriteGuard (new step 3.5 lease check + syncCheckoutId param); tables
    offline_checkouts + offline_sync_batches (RLS'd; partial unique active lease;
    request_id idempotency ledger); op dispatch onto the existing repo mutators with
    client-supplied UUIDs (no temp-id remapping); all-or-nothing batches (422 names
    the failing op); client third persistence branch in WorkspaceContext + IndexedDB
    (idb) snapshot/queue; vite-plugin-pwa app-shell precache only.
  - NEW docs/plans/p6-offline-execution-plan.md (binding playbook: O1–O6, Fable gates
    F4 after O3 + F5 after O6, escalation rule, migration DDL, API sketch, op table);
    NEW docs/test-specs.md §P6 (cross-tenant sync isolation is the critical suite;
    true-race double checkout; all-or-nothing; idempotent retry; PIN/wipe specs);
    NEW docs/decisions/2026-07-04-offline-mode-architecture.md (the §8 bridge).
  - Roadmap: field-mode row NEEDS DECISION → SCHEDULED (P6) + new P6 section (O1–O6
    checklist); production-status field-mode row updated; CLAUDE.md Current focus 0.5.
  Key files: docs/plans/p6-offline-execution-plan.md, docs/test-specs.md,
    docs/decisions/2026-07-04-offline-mode-architecture.md, docs/roadmap.md,
    docs/production-status.md, CLAUDE.md. make test not run (docs only).

2026-07-04 — feat(server): P4 O1 — Library management CRUD + seeding
  First Opus build session of the P4 playbook (docs/plans/p4-execution-plan.md, O1).
  No AI in this block — prereq so semantic search (O3) has content to search.
  - NEW /api/library module: CRUD on the existing library_entries table for the
    five §12 types (Scenarios/Mitigations/Vulnerabilities/Controls/Consequences).
    authenticate + facilityScope (RLS) at router level; reads open to any facility
    role, writes Admin-only (authorizeRole(ADMIN)); facilityId required per route
    (query on reads, body on writes) and checked by requireFacilityAccess. No new
    migration — table + facility_isolation RLS already existed (initial + P2).
  - libraryRepository.js (map/list/get/create/update/delete, facility-filtered,
    [before,after] diffs) + modules/library/schemas.js (Zod, LIBRARY_TYPES enum in
    services/constants.js). Every mutation writes ONE hyphen-vocabulary audit row
    (library-entry-created|updated|deleted) atomically with the change via
    appendAuditLog inside the request's RLS-scoped transaction.
  - Seed: §19-default library content per facility (Bonny 14xx / Pernis 15xx),
    idempotent via upsert-on-id.
  - middlewareCoverage.test.js: /api/library added to DATA_MODULES (guarded by
    requireFacilityAccess — no allowlist entries needed).
  - Integration suite library.test.js: CRUD lifecycle + audit rows, Admin-only-write
    / any-role-read matrix, cross-tenant (out-of-scope facility → 403; foreign entry
    id under in-scope facilityId → 404 no-leak), validation (missing facilityId /
    out-of-vocab type → 400). Server-only — no client library UI exists to wire (per
    plan: client library management is out of P4 scope).
  - Self /code-review (high) before commit: fixed one real finding — the facility
    access check now resolves the requested facility's operator_id so
    canAccessFacility's operator-wide branch works for operator-level HQ Executive /
    cross-facility Admin (was latent: current data has only per-facility role rows).
    Added fixture `hqOpOnlyA` + a regression test. Two other findings (key-order
    metadata diff, no-op update audit row) left as-is — deliberately consistent with
    the assetRepository/contentWriteGuard reference conventions.
  - DEVIATION (test-infra, flagged): export.test.js PDF smoke test hardened. pdf-parse@1.x's
    bundled pdf.js throws UnknownErrorException during its webpack module-eval depending
    on the jest VM heap; mounting the new /api/library router perturbs that heap and tripped
    it (the exported PDF is byte-valid — %PDF- magic assertion still passes). Fix parses the
    PDF in a fresh node subprocess (pristine module registry) — assertion strength unchanged
    (page count + "Facility A2" text still verified on real bytes). No product code involved.
  Key files: server/src/modules/library/{routes,schemas}.js,
    server/src/repositories/libraryRepository.js, server/src/services/constants.js,
    server/src/app.js, server/src/db/seed.js, server/tests/middlewareCoverage.test.js,
    server/tests/integration/library.test.js, server/tests/integration/export.test.js.
  make test GREEN: 272 unit / 23 client files / 143 integration.

2026-07-04 — docs(P4/P4.5): Fable spec session — execution playbook + §P4.5 test specs
  Fable session F1 of the agreed Fable↔Opus split (Fable = decisions/specs/2 review
  gates; Opus = all build work, since P4's test specs are binding + mechanical).
  Front-loaded ALL remaining design before the July-7 Fable window closes. No code.
  - NEW docs/plans/p4-execution-plan.md — binding Opus playbook: session order
    O1(library CRUD)→O2(AI foundation)→[F2 gate]→O3–O7(features 1–5)→O8(PLATFORM_OWNER
    + provisioning)→[F3 gate]→O9(console UI + entitlement toggle). Architecture bound:
    server/src/ai/ is the ONLY dir allowed to import the AI SDK (aiImportBoundary test
    written first in O2); runAiCall contract (entitlement → ceiling → rate-limit →
    gateway w/ exactly-one-retry → always-audit); dedicated ai_call_log table (not
    audit_log_entries — queryable §9.7 fields for budget SUMs) + ai_budgets (computed
    suspension, fire-once soft alert) + facility_entitlements; embeddings bound to
    text-embedding-3-small/1536 via gateway; escalation rule (deviations go to the
    playbook's Open questions, never improvised).
  - docs/test-specs.md: NEW §P4.5 — role-gating matrix, allowlist-as-second-gate, MFA,
    isolation NON-WEAKENING suite (existing RLS/cross-tenant tests pass unchanged),
    one-transaction provisioning atomicity (spy-throw → nothing persists), §19 seed
    assertions, link-only support access, entitlement toggle + read-time effect.
  - Decisions resolved (user, 2026-07-04): P4.5 support access = LINK-ONLY (audited
    self-assign of a normal role; no impersonation/dual-identity session — matches
    §17.6 "role flag, not special user type"); entitlements = owner-only v1 (keys
    anomaly_detection/consistency_flagging/offline_mode; base features always-on).
  - docs/roadmap.md: P4 intro → playbook pointer; entitlements line NEEDS DECISION →
    DECIDED; P4.5 placeholder → real scope write-up (header NEEDS DECISION → SPECCED).
  - CLAUDE.md Current focus rewritten: next action = Opus build session O1.
  Key files: docs/plans/p4-execution-plan.md, docs/test-specs.md, docs/roadmap.md,
  CLAUDE.md, docs/production-status.md. make test not run (docs only).

2026-07-04 — docs(roadmap): de-dup phase numbering (Platform Console / entitlements)
  Roadmap had Platform Console listed twice — as the P4.5 phase AND as a backlog item
  under "not in any current phase" (self-contradictory). Removed the backlog dup;
  Console lives only as the P4.5 phase. Slotted the per-facility add-on entitlements
  work into phases per the agreed split: data model + read-time gating → P4 checklist
  item; owner toggle + audit → P4.5 checklist item (was a dangling backlog sub-bullet).
  Also fixed a P3.5 collision: the proposed "P3.5 — Admin write API" reused the
  completed export phase's number → renamed "Admin write API (number TBD)". Phase spine
  now linear, each half-phase used once: P0→P1→P2→P3→P3.5→P4→P4.5→P5. Docs only, no code.
  Key file: docs/roadmap.md.

2026-07-04 — ops(seed): make the test tenant real in prod Supabase
  Ran the demo seed against the prod Supabase DB (no code change). Seeding the prod
  tenant is a DATA/DEPLOY task, distinct from the earlier DATABASE_URL wiring fix —
  connection strings were already correct; the prod DB just had no demo rows. Ran via
  the 5432 session pooler (MIGRATE_DATABASE_URL) since the 6543 transaction pooler
  chokes on the seed's transactions:
    cd server && DATABASE_URL="$(grep '^MIGRATE_DATABASE_URL=' ../.env | cut -d= -f2- | tr -d '"')" npm run seed
  Idempotent (fixed UUIDs, onConflict('id').merge(), scoped content reset — no
  cross-tenant TRUNCATE), safe to re-run. Verified live: 1 operator (Northstar),
  6 users (*.@operator-a.example), 3 assessments (Bonny 2026 In Review, Pernis
  Refinery Draft, Bonny 2025 Approved), 6 assets / 6 threats / 6 evaluations /
  5 mitigations. Redeploys DONE (user, via dashboards): Render (server) + Vercel
  (client) — Export button + dashboard hydration fix now live in prod. "Make the
  test tenant real" complete end to end.

2026-07-04 — docs(roadmap): add Platform Console phase (P4.5)
  Captured a new owner-facing "Platform Console" idea in the roadmaps (no code).
  Owner/consultant surface SEPARATE from customer Admin: new-tenant provisioning
  (operator → facility → first Admin, seeded from BL §19), cross-client portfolio
  dashboard, and audited support access; new PLATFORM_OWNER role + /platform/*
  namespace that must not weaken tenant isolation. Open decision recorded:
  impersonate-into-client vs link-only support model.
  - docs/roadmap.md: new "## P4.5 — Platform Console" phase (after P4, before P5,
    status NEEDS DECISION) + a linked line under Suggested improvements tying it to
    the existing Staging onboarding kit backlog item.
  - docs/strategic-roadmap.md: item #15 under "Later (v1.1+)".
  Placeholders only — user will flesh out with fable. Key files: docs/roadmap.md,
  docs/strategic-roadmap.md.

2026-07-04 — chore(seed): match seeded entity shapes to the client adapters
  Follow-up so §3–§7 + §9 matrix actually RENDER (not just exist). The first
  pass used the wrong JSONB shapes: evaluations stored r1/r2 as {score,band},
  but the client (toClientEvaluation) reads r1/r2 as {consequence,likelihood}
  (1–5 axis values; score/band are derived) — so §5/§6 and the risk matrix were
  blank. Corrected per docs/decisions/2026-07-04-content-entity-field-mapping.md:
  - evaluations r1={consequence,likelihood,consequences}, r2={consequence,likelihood}
  - assets details={description,dependencies,consequences}
  - threats details={short,classification,history,facilityHistory,capabilityIntent,rating}
    (demo UI keys off `rating`, not the likelihood int column).
  §9 References have no server model (demo-only) — not seedable; contributors +
  risk matrix (derived from the fixed evals) do populate. Re-verified in DB.

2026-07-04 — chore(seed): populate Bonny 2026 + Pernis test assessments
  Enriched server/src/db/seed.js so the two test assessments carry full content
  for exercising every feature end-to-end in prod mode.
  - Bonny 2026 (In Review): +marine×maritime link + evaluation + mitigation, a
    2nd contributor, and §1/§2/§8 narrative (facility info as JSON in section 2).
  - Pernis Refinery (Draft): full set from empty — 3 assets, 3 threats, 3 enabled
    links, 3 evaluations, 2 mitigations, 2 contributors, §1/§2/§8 narrative.
  - Fixed a pre-existing anomaly: Bonny 2025's evaluation referenced Bonny 2026's
    marine asset/threat pair (evaluations are UNIQUE on asset_id+threat_id), which
    collided with the new 2026 marine eval. Gave Bonny 2025 its own marine
    asset/threat/link so it's self-consistent (and its Approved export now has
    real §3/§4/§5 tables). §2 JSON matches the client FacilityInfo form shape.
  Made the seed self-resetting: it now clears content for its OWN three demo
  assessment ids (scoped DELETEs, not a table TRUNCATE) before re-inserting, so
  `npm run seed` is idempotent against any prior state (verified: ran twice over
  existing data, counts stable) — needed because re-pointing an evaluation trips
  the evaluations(asset_id,threat_id) unique index on a plain upsert.
  Verified: re-seeded local vantage DB, GET /:id returns all content + parsed
  section text for both assessments. Seed file only — committable/reproducible.
  Supabase seeding is a user-run prod step (safety guard blocked a table wipe;
  the scoped-reset seed now runs cleanly against Supabase). Key file:
  server/src/db/seed.js.

2026-07-04 — fix(client): prod dashboards empty (hydrate list from API)
  Found during P3.5 browser smoke: in prod every role dashboard showed 0
  assessments while /assessments (list page) showed them. Cause: dashboards
  render from the in-memory `assessmentsById` store, which is fixture-seeded;
  in prod those fixtures carry demo facility/author ids that never match the
  real session, so `filterAssessmentsForRole` narrowed to empty. The P3 (g)
  flip wired the list page + workspace to the API but never the dashboards.
  Fix (two parts):
  - WorkspaceContext.hydrateAssessmentsList(actingRole): prod fetches
    GET /api/assessments, maps via toClientAssessment + getInitialAssessmentState,
    and REPLACES assessmentsById with the real rows (demo = no-op). Triggered
    once in AppShell on mount / acting-role change.
  - filterAssessmentsForRole gains a { serverScoped } option: in prod the server
    already role+facility-scoped the rows (and the list API carries no
    reviewer/approver ids), so skip the per-user narrowing and keep only the
    facility guard — mirrors the AssessmentsListPage 2026-07-03 decision. Author/
    Reviewer/Approver dashboards pass serverScoped:!isDemoEnabled().
  Key files: client/src/features/assessmentWorkspace/WorkspaceContext.jsx,
    .../assessmentModel.js, client/src/layouts/AppShell.jsx,
    client/src/pages/dashboards/{Author,Reviewer,Approver}Dashboard.jsx,
    .../dashboardHydration.test.jsx.
  Tests: 188 client green (+4: hydrate replaces store prod / no-fetch demo;
  serverScoped keeps in-facility rows vs default narrowing). Server untouched.

2026-07-04 — P3.5 client: Export button (§16) — P3.5 now COMPLETE
  Wired the workspace Export control onto the P3.5 server endpoint.
  - api/client.js: apiDownload (blob sibling of apiRequest — same auth header +
    credentials + single 401 refresh-retry; reads Blob + Content-Disposition
    filename instead of JSON).
  - api/assessmentApi.js: exportAssessment({assessmentId,format,actingRole}) +
    EXPORT_FORMATS. api/download.js: triggerBrowserDownload (object-URL anchor
    click, isolated for mocking).
  - WorkspaceContext.exportDocument(format, actingRole): prod↔demo seam — PROD
    downloads via exportAssessment→triggerBrowserDownload for the active
    assessment; DEMO fires NO network (fixtures have no rendered doc) and returns
    { demo:true }. Exposed on the context value.
  - UI: ExportModal (Word/PDF chooser + non-final watermark note + busy/inline
    error; closes on ok/demo) added to the modals barrel; "Export document"
    ToolButton in AssessmentShell Tools rail (available in any state, §16.2);
    AssessmentWorkspacePage owns exportOpen + handleExport (toasts per outcome).
  Key files: client/src/api/{client.js,assessmentApi.js,download.js},
    client/src/features/assessmentWorkspace/WorkspaceContext.jsx,
    client/src/features/assessmentWorkspace/modals/{ExportModal.jsx,index.js},
    client/src/layouts/AssessmentShell.jsx,
    client/src/pages/assessments/AssessmentWorkspacePage.jsx,
    client/src/features/assessmentWorkspace/modals/ExportModal.test.jsx.
  Tests: make test → 261 server unit / 184 client / 124 integration green.
    New RTL suite ExportModal.test.jsx (6): prod docx/pdf fire GET /export?format,
    watermark note by state, 403 inline error, demo no-fetch. P3.5 COMPLETE.

2026-07-04 — P3.5 server: Word/PDF document export (§16)
  Server-side of P3.5 landed (client Export button deferred as a follow-on).
  Endpoint: GET /api/assessments/:id/export?format=docx|pdf on the assessments
  router — a read + audited download, NOT a content mutation, so it uses the
  repo-scoped-getter pattern (getAssessmentForUser → null → 404) and is added to
  the middlewareCoverage allowlist. Roles: all section-readers may export
  (Author/Reviewer/Approver/HQ Exec/Admin); Mitigation Owner → 403.
  - services/exportService.js: buildAssessmentDocx (docx npm) + buildAssessmentPdf
    (pdfkit — pure-JS, no headless browser; DoD PDF checks are minimal so pdfkit
    meets them and stays fast/CI-deterministic, superseding the roadmap's
    "print-CSS" suggestion). Both render from ONE deriveTables source so the two
    formats never drift. Cover page, Document Approvals + Version Control
    front-matter, Sections 1–8 tables + Appendices (SRA Team Members), watermark.
  - repositories/exportRepository.js: loadExportBundle (frozen `versions` snapshot
    when Approved, else live bundle) + getExportFrontMatter (approvals from lead
    author + audit sign-off events review_completed/approved; Version Control from
    versions). Watermark on any non-Approved state (lenient read of §16.2 covering
    Awaiting Approval); Approved exports are clean. Every export writes an `export`
    audit row (metadata: format/watermarked/frozenSnapshot), atomic under
    facilityScope's txn.
  - Decisions (user-approved recommendations): PDF engine = pdfkit; export roles =
    section-readers except Mitigation Owner; scope = server API + tests (client
    button follow-on).
  Deps: +docx, +pdfkit (deps); +mammoth, +pdf-parse (devDeps, test parsing only).
  Key files: server/src/services/exportService.js, server/src/repositories/exportRepository.js,
    server/src/modules/assessments/routes.js, server/tests/integration/export.test.js,
    server/tests/middlewareCoverage.test.js (allowlist), assessmentRepository.js (exports).
  Tests: make test → 252 unit / 124 integration green (+2 unit from the allowlist
    entry; +15 integration = export.test.js §P3.5 full DoD: golden-content docx via
    mammoth, PDF smoke via pdf-parse, role matrix, export audit, frozen snapshot,
    <30s guard).

2026-07-04 — fix: prod workspace open crash (React #310)
  AssessmentWorkspacePage ran useMemo after early returns during prod hydration
  (loading → ready), violating Rules of Hooks and crashing on Open from /assessments.
  Moved errorsBySection + commentCounts useMemo above the loading/redirect guards;
  validateAssessment already no-ops on null assessment. Regression test:
  AssessmentWorkspacePage.test.jsx (prod loading→hydrated, demo fixture no-fetch).
  Client tests: 2 new (AssessmentWorkspacePage.test.jsx green).

2026-07-04 — P3 (g) server: auto-create evaluation on link-enable (close eval gap)
  Closed the one gap from the content-entity write flip (user chose auto-create
  over a separate POST). Section 6 evals had PATCH only + no create path.
  - Server: setAssetThreatLink (linkRepository) now, when a pair is ENABLED and no
    evaluation exists for it, inserts an empty evaluation row (ensureEvaluation;
    idempotent — returns { row, created }). Disable never deletes it (re-enable
    restores work). The link route returns { link, evaluation, lockVersion }; the
    write-guard audit records metadata.evaluationCreated on first create. Refactored
    setAssetThreatLink to a unified linkRow/before path.
  - Client: toggleMatrix prod branch adds the echoed evaluation (mapped via
    toClientEvaluation) to local state on enable when the pair has none, giving
    Section 6 a real UUID row to PATCH immediately.
  - Tests: +2 integration (fresh enable auto-creates + echoes + audit metadata;
    re-enable echoes existing without duplicating). Ran the FULL suite with the
    docker test DB: TEST_DATABASE_URL=…/vorge_test make test → 250 unit / 176
    client / 109 integration all green. P3 write/section API now feature-complete
    end-to-end.

2026-07-04 — P3 (g) WRITES: remaining content entities (threats/links/evals/contributors)
  Finished the content-entity write flip — all four remaining entities, same mold
  as Assets. P3 (g) client flip now COMPLETE.
  - Threats (§4): toServerThreatPayload (inverse; name column + details bag) +
    prod-aware addThreat(POST)/persistThreat(PATCH on blur)/removeThreat(DELETE,
    server cascades links) in WorkspaceContext; ThreatAssessmentSection blur/rating
    persist + async add/remove + conflict banner.
  - Asset×threat links (§5): toggleMatrix is prod-aware — PUT /links with
    enabled=!wasTicked + lockVersion; updates matrix+links, syncs version; server
    owns audit + no client-side eval pruning. AssetThreatMatrixSection routes all
    4 toggle call sites through applyToggle (surfaces 409).
  - Evaluations (§6): toServerEvaluationPayload (existingControls→controls,
    R1/R2→r1/r2 bags, consequences→r1.consequences) + persistEvaluation→PATCH on
    blur; EvaluationSection editor persists text on blur + risk-blocks on discrete
    change (overrides). KNOWN SERVER GAP: evaluations have PATCH only — no create
    path (link-enable doesn't seed one). persistEvaluation guards on UUID ids so
    client stubs don't fire doomed PATCHes; editing EXISTING evals works, creating
    NEW ones in prod needs a server endpoint (roadmap backlog + decision-doc note).
  - Contributors (§9.A): saveContributors→whole-list PUT /contributors + lockVersion;
    ContributorsCard (AppendicesSection) now inits from assessment.contributors,
    persists on add/remove/field-blur (teamRef), conflict banner.
  - Infra: UUID_RE module const; syncLockVersion reused across all writes.
  - Tests: 4 new section write suites (threats/matrix/evaluations[hydrated UUID
    eval]/appendices) = +13. make test: 250 server / 176 client green (integration
    not run — no TEST_DATABASE_URL; slices are client-only).

2026-07-04 — P3 (g) WRITES: §2 Facility Info + Assets (Section 3) content writes
  Continued the client flip onto live writes (user: "go with your recommendation"
  — content-entity writes + §2 serialize approach).
  - §2 Facility Info (structured form): DECIDED serialize→JSON in the section-2
    content_text column (no new server model; sign-off 2026-07-04, recorded in the
    field-mapping decision doc). Adapters serializeFacilityInfo/parseFacilityInfo
    (parse merges over defaults; tolerates legacy plain text). FacilityInfoSection
    inits from the parsed blob and saves the whole form on blur through
    saveSectionText(section 2) — prod live PUT w/ lockVersion + 409 reload banner;
    demo no-fetch. Operator-memory autocomplete recording unchanged. Skips the PUT
    when nothing changed since last save (lastSavedRef).
  - Assets (Section 3) writes — the reference content-entity flip:
    · Write adapter toServerAssetPayload (inverse of toClientAsset: type→assetType
      column, description/dependencies/consequences + any client-only key → details).
    · WorkspaceContext now prod-aware: addAsset→POST (maps server UUID back, syncs
      lockVersion), removeAsset→DELETE, NEW persistAsset→PATCH on field blur.
      updateAsset stays local/optimistic (per-keystroke). A stateRef mirrors state
      so the async writes read the freshest assets + active-assessment lockVersion;
      syncLockVersion merges each response's version back so the next write's
      optimistic-concurrency check doesn't fail stale. persistAsset takes an
      `overrides` arg for discrete changes (criticality toggle) whose setState
      hasn't flushed to the ref yet. 409 → { conflict } → reload banner; demo = no
      network.
    · AssetDisaggregationSection: onBlur→persist on the 4 text fields, toggle
      persists with an override, async add (auto-expands the server-id row), async
      remove, top-of-section conflict banner.
  - Tests: FacilityInfoSection.test.jsx (3) + AssetDisaggregationSection.write.test.jsx
    (4) — prod fires PATCH/POST/DELETE/PUT w/ lockVersion + details packing, 409
    renders reload copy, demo fires nothing. make test: 250 server-unit / 163
    client green (integration not run — no TEST_DATABASE_URL; slice is client-only).
    Existing AD-1 test unaffected (it only fires onChange, never blur/add/remove).
  - Remaining P3 (g): writes for threats / link-toggle / evaluations / contributors
    — same mold as Assets.

2026-07-04 — P3 (g) content-entity READS: prod bundle hydrates child entities
  Continued the client flip. The opened assessment now reads its child entities
  live in prod (was: fields + section text only; child rows still fixtures).
  - Adapters (client/src/api/adapters.js): toClientAsset / toClientThreat /
    toClientEvaluation / toClientLinks — unpack the server's lean row + JSONB bag
    (assets/threats: details; evaluations: r1/r2) back into the demo-rich flat
    client shapes. Unknown bag keys spread through (nothing lost, e.g. AD-1
    anomalyAcks). toClientLinks yields BOTH the {assetId,threatId} presence list
    and the matrix map; enabled-only (disabled/absent pair = not linked); scores
    derived from R1/R2, never stored.
  - WorkspaceContext.hydrateAssessmentBundle: in prod now also replaces the
    top-level assets/threats/evaluations/links/matrix slices from the bundle
    (single-active-assessment model, §17.7). Demo still a no-op.
  - Decision recorded (docs/decisions/2026-07-04-content-entity-field-mapping.md):
    the canonical client↔server field mapping, fixed once so the write slice packs
    via its inverse. No server schema change — every rich field has a column or a
    JSONB home.
  - Tests: hydrateBundle.test.jsx extended (prod maps asset/threat/eval rows +
    matrix on/off + link count; demo fires no fetch). make test: 250 server-unit /
    156 client green (integration not run — no TEST_DATABASE_URL; slice is
    client-only). Remaining P3 (g): content-entity WRITES + §2 Facility Info
    structured-form decision.

2026-07-03 — P3 (g) reads + §8: prod list/bundle hydration + Conclusion save
  Continued the client flip (user picked "reads + narrative writes"). Two surfaces
  now read live data in prod; demo keeps fixtures (fetch-spy proven).
  - Adapter: client/src/api/adapters.js — toClientAssessment (server→client shape;
    defaults the demo-only display fields the server doesn't model: cycle, version
    label, completedSectionIds, sectionValidation) + applySectionTexts (sectionTexts
    {1,2,8} → executiveSummary/facilityInfo/conclusion). assessmentApi.listAssessments added.
  - List (AssessmentsListPage): prod fetches GET /api/assessments locally on mount,
    adapter-maps, renders — with loading + error affordances. Per the 2026-07-03
    decision, prod does NOT re-apply the client's per-user Reviewer/Approver
    narrowing (server tracks no reviewer/approver assignment; server already
    role/facility-scopes the rows). Demo still uses the fixture per-user filter.
    Kept the flip LOCAL to the page (no global state swap) so dashboards are untouched.
  - Workspace (WorkspaceContext.hydrateAssessmentBundle + AssessmentWorkspacePage):
    prod hydrates the OPENED assessment's fields + section texts from GET /:id into
    assessmentsById; page shows a loading state instead of redirecting while in flight;
    404 → redirect. Child entities (assets/threats/…) still fixture-backed until the
    content-entity flip.
  - §8 Conclusion: save-on-blur through saveSectionText (sectionNumber 8), 409 →
    exact reload affordance — mirrors §1. §2 Facility Info NOT wired: it's a
    STRUCTURED form (name/region/type/manager/general…), not a single content_text
    blob — needs a structured-section-data decision first (noted in roadmap).
  Model-divergence surfaced to user (client demo model richer than server): (A)
  cosmetic fields → adapter defaults; (B) reviewer/approver visibility → decided to
  rely on server scoping in prod. Both recorded above.
  Tests: AssessmentsListPage.test.jsx (prod hydrate + error + demo no-fetch),
  ConclusionSection.test.jsx (§8 PUT w/ lockVersion + 409 copy + demo no-fetch),
  hydrateBundle.test.jsx (prod maps section texts; demo no-op). Client 155 (+8, 14
  files); server unchanged (250 / 107); make test green; client build compiles.
  Remaining P3 (g): content-entity reads/writes + the §2 structured-section decision.
  Key files: client/src/api/{adapters,assessmentApi}.js,
  client/src/features/assessmentWorkspace/WorkspaceContext.jsx,
  client/src/features/assessmentWorkspace/sections/ConclusionSection.jsx,
  client/src/pages/assessments/{AssessmentsListPage,AssessmentWorkspacePage}.jsx (+ tests).

================================================================

2026-07-03 — P3 (g) start: client API seam + section-save vertical slice (prod↔demo)
  Discovered the whole feature/workspace layer is fixtures in BOTH modes (only auth
  pages ever called the API) — so "flip" is really "build the prod data path". Per
  user decision, did the tested vertical slice + reusable seam (not the full rewire).
  - client/src/api/assessmentApi.js: typed wrappers over apiRequest for EVERY P3
    endpoint (sections, assets, threats, links, evaluations, contributors, workflow,
    lead-author, mitigation owner) + getAssessmentBundle. Exports CONFLICT_RELOAD_MESSAGE
    (single source of truth for the 409 copy) + isConflict().
  - WorkspaceContext.saveSectionText: the prod↔demo seam. PROD → live PUT /sections/:n
    with the lockVersion the client read, updates local text + lockVersion from the
    response, maps a lost lock_version race to result.conflict (CONFLICT_RELOAD_MESSAGE).
    DEMO → updates fixtures only, never touches the network.
  - ExecutiveSummarySection (Section 1): save-on-blur through the seam; on conflict
    renders an error Banner with the exact reload copy + a Reload button. (Previously
    the "auto-saved" footer was cosmetic — text was never persisted at all.)
  - Test (test-specs §P3 "Client flip"): ExecutiveSummarySection.test.jsx — prod edit
    fires PUT /sections/1 with lockVersion=1 (asserted from the fetch body) + no conflict
    affordance on success; a 409 renders the exact CONFLICT_RELOAD_MESSAGE + Reload button;
    demo edit fires NO fetch (spy). vi.stubEnv toggles VITE_ENABLE_DEMO per block.
  Counts: client 147 (11 files, +3); server unchanged (250 unit / 107 integration);
  make test green. §P3 client-flip DoD met. Remaining P3: broad per-section rewire
  (replicate the seam across the rest of the workspace reads/writes) — its own chunk.
  Key files: client/src/api/assessmentApi.js,
  client/src/features/assessmentWorkspace/WorkspaceContext.jsx,
  client/src/features/assessmentWorkspace/sections/ExecutiveSummarySection.jsx(+.test.jsx).

================================================================

2026-07-03 — P3 slices (d)+(e)+(f): full write API server-side (all content + workflow-adjacent endpoints)
  Fanned the write-guard pattern out to every remaining entity; P3 server-side complete.
  (d) Threats CRUD, links (PUT enable/disable), evaluations (PATCH), contributors
      (PUT). New repos threatRepository/linkRepository/evaluationRepository +
      replaceContributors on assessmentRepository; all flow through
      runContentMutation. Audit vocab: threat-created/updated/deleted,
      link-updated, evaluation-updated, contributors-updated.
  (e) Section text: PUT /api/assessments/:id/sections/:n on assessment_sections
      (upsert), narrative set {1,2,8} validated in Zod (non-narrative → 400). GET
      bundle now returns sectionTexts keyed by number. Round-trip test
      (unicode/long/empty) + migration idempotency (migrate:latest twice).
  (f) Withdraw/recall: added optional lockVersion to POST /:id/workflow
      (updateAssessmentState checks it in the WHERE) — closes the AGENTS.md
      recall-race concern (withdraw with matching lockVersion → 200, reviewer's
      late complete_review → 409; stale lockVersion → 409). Lead Author
      reassignment: PUT /:id/lead-author — dedicated guard chain (current Lead
      Author OR Admin; non-Approved; target must hold Author at facility → 422
      TARGET_NOT_AUTHOR) + lockVersion + atomic audit (assessment.lead_author_reassigned).
      Mitigation owner assignment: PUT /:id/mitigations/:mid/owner through the
      write-guard (Author/Draft); assignMitigationOwner on mitigationRepository.
  Infra fix (flagged deviation, touches P2): facilityScope now COMMITS the request
      transaction BEFORE flushing the response (intercepts res.end) — previously it
      committed on res.finish (after the response was sent), leaving a read-your-writes
      gap + ack-before-durable on writes. Found via a flaky P3 delete-then-read test;
      now deterministic across repeated runs. Decision:
      docs/decisions/2026-07-03-facility-scope-commit-before-flush.md. rlsWiring/rls
      tests (drive runInFacilityScope directly) unaffected.
  Tests: contentWritesD.test.js, sectionText.test.js, workflowConcurrencyF.test.js;
  tenantIsolation.test.js extended to every new mutation (10 cross-tenant cases now).
  Red-checks: workflow lockVersion off → withdraw-stale fails; reassignment role
  off → reviewer-reassign fails; target-author off → 422 test fails. (Plus the
  (a)–(c) content-guard red-checks from the prior entry.)
  Counts: server unit 250 (16 suites); integration 107 (10 suites); client vitest
  green; services coverage gate held. `make test` green (ran twice for determinism).
  Remaining P3: (g) client flip (prod mode off fixtures + 409-reload RTL). Roadmap
  P3 server boxes ticked; api-contract.md still NOT edited (per kickoff — edited only
  on explicit instruction when P3 fully lands).
  Key files: server/src/repositories/{threat,link,evaluation,asset,mitigation,assessment}Repository.js,
  server/src/repositories/sectionRepository.js, server/src/modules/assessments/{routes,schemas,contentWriteGuard}.js,
  server/src/middleware/facilityScope.js,
  server/tests/integration/{contentWritesD,sectionText,workflowConcurrencyF,tenantIsolation}.test.js,
  docs/decisions/2026-07-03-facility-scope-commit-before-flush.md.

================================================================

2026-07-03 — P3 slice (a)+(b)+(c): write-API foundation + Assets reference endpoint
  First code of P3 (the missing write core). Landed the three de-risking pieces
  the kickoff sequences first, per docs/p3-kickoff.md.
  (a) Migration 202607030003_assessment_sections.js — new RLS-scoped
      assessment_sections table for Section 1/2/8 narrative text (schema gap).
      Additive + idempotent (hasTable guard + DROP/CREATE policy, same PREDICATE
      as 202607030002). Table-vs-JSONB decision recorded:
      docs/decisions/2026-07-03-assessment-sections-table.md (chose the table for
      RLS consistency + clean lock_version granularity). Endpoints are slice (e).
  (b) Shared content write-guard: src/modules/assessments/contentWriteGuard.js
      (runContentMutation). ONE place enforces the six-case ground rules + optimistic
      concurrency + atomic audit, so every future content endpoint is a thin caller.
      Guard order: out-of-scope→404, non-Author→403, non-Draft→409, stale/racing
      lock_version→409 LOCK_VERSION_CONFLICT. lock_version bump + mutation + audit run
      in one activeConn().transaction (savepoint); bump-first row-locks racers so a true
      concurrent race yields exactly one 200 + one 409. appendAuditLog imported as a
      namespace so the atomicity test can spy+reject it.
  (c) Assets CRUD reference endpoint (POST/PATCH/DELETE /api/assessments/:id/assets)
      — src/repositories/assetRepository.js (diff = before/after of changed fields
      only; delete = {deleted:[snapshot,null]}), routes + Zod schemas (schemas.js;
      lockVersion required → missing=400). action_type vocabulary: asset-created/
      updated/deleted (lowercase-hyphen per test-specs §P3). Added the 3 routes to
      REPO_SCOPED_ALLOWLIST in middlewareCoverage.test.js (repo-scoped pattern).
  Tests (test-specs §P3 DoD for assets): assetsWrite.test.js (happy 201/200/200,
  400 validation, 401, 403 role MATRIX all 5 non-Author roles, 409 state MATRIX
  In Review/Awaiting Approval/Approved, ASSET_NOT_FOUND 404), lockVersion.test.js
  (correct/stale/missing + TRUE Promise.all race → one 200 + one 409), writeAudit.test.js
  (exactly one row + shape; no row on 409/403; ATOMIC rollback when audit insert
  forced to fail), tenantIsolation.test.js EXTENDED (cross-tenant POST/PATCH/DELETE
  → 404, Op-B rows unchanged).
  Red-checks (ground rule 1): removed each of the 3 guards in turn — lock_version
  guard off → stale+race fail; role guard off → all 5 role-matrix fail; state
  guard off → all 3 state-matrix fail. Restored; all green.
  Counts: server unit 232 pass (16 suites); integration 66 pass (7 suites);
  services coverage gate (95%, scoped to src/services/**) unaffected — new code lives
  in modules/repositories, covered by integration + route tests. `make test` green.
  Next (paused for review before fanning out, per kickoff): (d) replicate to
  threats/links/evaluations/contributors; (e) section-text endpoints; (f)
  withdraw/recall + Lead Author reassignment + mitigation-assignment; (g) client flip.
  Key files: server/migrations/202607030003_assessment_sections.js,
  server/src/modules/assessments/{contentWriteGuard,schemas,routes}.js,
  server/src/repositories/{assetRepository,assessmentRepository}.js,
  server/tests/integration/{assetsWrite,lockVersion,writeAudit,tenantIsolation}.test.js,
  server/tests/middlewareCoverage.test.js,
  docs/decisions/2026-07-03-assessment-sections-table.md.

================================================================

2026-07-03 — Staging smoke GREEN after redeploy: P2 verified LIVE
  Post-redeploy of the audit fix (8cfc5f9), full staging smoke passed against
  vorge-api-staging.onrender.com: /health 200; POST /api/auth/login 200 (token,
  Author, real user Adaeze Okeke); GET /api/assessments 200 → 3 scoped rows
  (Bonny Terminal ×2, Pernis Refinery Complex) served via the non-owner vorge_app
  role under RLS. Non-empty scoped data end-to-end confirms non-owner role +
  facilityScope context + RLS all working. P2 (tenant isolation) verified live.

================================================================

2026-07-03 — P2 hotfix: staging login 500 — audit writes denied by RLS (appendAuditLog self-scopes)
  Staging smoke caught a P0 regression from the RLS work: POST /api/auth/login
  returned 500 under the non-owner `vorge_app` role. Root cause (confirmed by a
  red-check reproducing the exact error `new row violates row-level security
  policy for table "audit_log_entries"`): login audits the event via
  appendAuditLog → INSERT into audit_log_entries, which is RLS-protected, but the
  auth routes don't run through facilityScope, so no app.current_facility_ids
  context was set → WITH CHECK denied the insert. Owner-run tests never saw it
  (owner bypasses RLS). Same latent break in getPreviousHash (no context → read
  returns nothing → hash chain would silently restart every entry).
  Fix: appendAuditLog now runs its read-back + insert inside a transaction (a
  SAVEPOINT when the caller already passed one, preserving atomicity with the
  caller's work; a real txn when called standalone e.g. failed-login) whose
  facility context is set to the entry's own facilityId. Covers all auth audit
  writes (login/logout/admin reset) and request-scoped ones alike. All 5 callers
  pass a non-null facilityId (auditAuthEvent early-returns when none).
  Test: rlsWiring.test.js +1 — appendAuditLog on the non-owner pool with no
  pre-set context succeeds AND chains the hash (2nd entry.previousHash == 1st
  hash). Red-checked (remove set_config → RLS-deny → fail).
  Tests: 226 server unit + 144 client + 39 integration (was 38, +1) green.
  Diagnosis of the earlier two 500s (already resolved by user before this): (1)
  URL-encoded password — `/` and `=` in the vorge_app password made DATABASE_URL
  an invalid URL (pg-connection-string threw); user rotated to a hex password.
  (2) Render env var name — app reads DATABASE_URL only (not VORGE_APP_DATABASE_URL,
  the local .env name); user corrected the Render var. This audit-RLS fix is the
  third and (pending redeploy + re-smoke) final blocker. NEEDS: commit → push →
  Render redeploy → re-run smoke to confirm vorge_app + RLS serve real data.

================================================================

2026-07-03 — P2 CLOSED: Supabase dashboard checkpoint complete, RLS live on staging
  User completed the manual checkpoint that flips RLS from tests-only to enforced:
    - Ran migration 202607030002_rls_policies on Supabase staging.
    - Created non-owner role `vorge_app` + grants in the Supabase SQL editor
      (NOT owner, NOT BYPASSRLS — so the policies apply to it).
    - Repointed Render `vorge-api-staging` DATABASE_URL at `vorge_app` (transaction
      pooler). (Secret lives only in Render/.env — never committed.)
    - Smoke passed: /health + browser login and data on vorge-app.vercel.app.
  Effect: the base pool now connects as a non-owner role, so the per-request
    facility context (runInFacilityScope/activeConn, shipped earlier today) is
    now load-bearing — RLS enforces tenant isolation on staging, beneath the
    repo/route guards. P2 deliverables 0–4 complete in code AND live.
  Docs: roadmap P2 section marked ✅ COMPLETE + checkpoint ticked + stale duplicate
    mitigations-hardcode item reconciled; production-status Phase 2 → ✅ Done (RLS
    live via vorge_app); CLAUDE.md Current focus → P2 done, P3 next (PAUSED for go).
  No code changed this entry — planning-doc + config commit only. Next: P3
    write/section API, on user go-ahead.

================================================================

2026-07-03 — P2 (cont.): RLS app wiring + AGENTS invariant 2 reconcile
  Closes the app half of deliverable 4: every assessments/mitigations request now
  runs its DB work inside a txn pinned to the acting role's facility context, so
  Postgres RLS enforces isolation beneath the repo-layer scoping.
  Added:
    - src/db/requestScope.js: AsyncLocalStorage-based activeConn() (returns the
      per-request scoped trx or the base pool) + runInFacilityScope(ids, work,
      conn=db) — opens a txn, SELECT set_config('app.current_facility_ids', ids,
      true), runs work in ALS so every await inside sees the scoped conn. Commits
      on resolve / rolls back on throw.
    - src/middleware/facilityScope.js: resolveFacilityIds (direct facilities +
      operator-wide roles expanded via a facilities lookup — RLS keys on
      facility_id only, so HQ/Admin operator scope must be expanded) then wraps
      the request in runInFacilityScope, committing on res finish.
  Changed:
    - facilityScopeFor MOVED assessmentRepository → facilityAccessService (so the
      middleware imports it without pulling a mocked repo; +4 unit tests for its
      HQ/Admin/dedup/empty branches to hold the 95% services gate).
    - assessment/mitigation/audit repos default trx = activeConn() (was = db), so
      reads/mutations auto-use the scoped txn; explicit-trx callers unaffected.
    - assessments + mitigations routers: router.use(facilityScope) after
      authenticate; content mutations use activeConn().transaction (savepoint on
      the request conn — inherits context, rolls back independently on conflict).
    - getAssessmentBundleById: Promise.all → sequential awaits (a single txn
      connection can't run concurrent queries; was tripping pg's deprecation).
    - tests/routes.test.js db mock: trx now carries .raw/.transaction/.fn.now.
  Added test:
    - tests/integration/rlsWiring.test.js (5 cases, as the NON-OWNER role):
      WIRED read inside runInFacilityScope returns the scoped facility's rows;
      UNWIRED same read (no context) returns [] (RLS default-deny — the safety
      net proving isolation holds even if repo filtering were bypassed); operator
      expansion; WIRED HQ sees only its operator's facilities; rollback on throw.
  Red-check: neutered set_config to an empty context → the two WIRED tests FAILED
    (RLS denied), UNWIRED/expansion/rollback still passed → reverted.
  Also reconciled AGENTS.md invariant 2: code is correct (isDemoEnabled() gates on
    VITE_ENABLE_DEMO === "true", deliberately not import.meta.env.DEV); aligned
    the doc to the code (heading "flag-gated" + mechanism). No decision record
    (per the new no-records-unless-asked rule).
  SAFE TO LAND / INERT UNTIL ROLE SWITCH: base pool still connects as owner →
    owner bypasses RLS → behavior unchanged; existing owner-role integration
    tests (tenantIsolation) still green through the new middleware. Enforcement
    turns on when DATABASE_URL points at the non-owner role (Supabase checkpoint).
  Tests: 226 server unit (was 222, +4) + 144 client + 38 integration (was 33, +5)
    green via `TEST_DATABASE_URL=... make test`. Services branch gate held (96%).
  === P2 REMAINING ===
  Only the Supabase dashboard checkpoint (create non-owner app role + grants,
  point DATABASE_URL at it) — then P2 is done. Deliverables 0–4 complete in code.

================================================================

2026-07-03 — Planning doc maintenance rules (no plan rewrites)
  AGENTS.md + CLAUDE.md: four-file upkeep table (roadmap tick-only, SESSION_LOG append,
  production-status status rows, Current focus sync). Explicit: do not restructure
  roadmap/production-status/strategic-roadmap unless user asks; no decision records
  unless asked. CLAUDE.md Current focus synced to P2-in-progress / P0-complete.
  Pre-commit hook nudge now includes docs/roadmap.md.

2026-07-03 — Disable AI co-author on commits
  Claude Code attribution off (`attribution.commit`/`pr` empty in .claude/settings.json).
  Agent rules in CLAUDE.md + AGENTS.md: no Co-Authored-By trailers on commits or PRs.

2026-07-03 — P2 (cont.): RLS policies as the non-owner app role (test-specs §P2 deliverable 4, DB layer)
  Defense-in-depth beneath repo-scoping + route guards. DB-layer scope only this
  session (per user decision); the invasive per-request txn-context wiring is the
  documented next step.
  Added:
    - migrations/202607030002_rls_policies.js: uniform tenant-isolation policy on
      all 10 facility-scoped DATA tables (assessments, assets, threats,
      asset_threat_links, evaluations, mitigations, audit_log_entries,
      mitigation_progress_logs, versions, library_entries). ENABLEs RLS on the 3
      that weren't already. Predicate: facility_id = ANY(string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true),''),',')::uuid[])
      for USING + WITH CHECK. Unset context → NULL → default-DENY. Idempotent
      (DROP POLICY IF EXISTS then CREATE; PG<15 has no CREATE POLICY IF NOT EXISTS)
      + down. NO FORCE ROW LEVEL SECURITY: the owner must bypass so migrations/seed
      can insert without context. Auth/lookup tables (users, role_assignments,
      operators, facilities) intentionally get NO policy — authenticate loads the
      user BEFORE any facility context exists.
    - tests/integration/global-setup.js: idempotently provisions a NON-OWNER
      LOGIN role vorge_app_rls (no BYPASSRLS) + DML grants — the local stand-in
      for the Supabase app role. Exports APP_ROLE/APP_PASSWORD.
    - tests/integration/rls.test.js (7 cases): connects AS the non-owner role.
      Context set → only that facility's rows; multi-facility context → both,
      zero Op-B; child table scoped identically; NO context → 0 rows (default-
      deny); cross-tenant UPDATE by id → 0 rows affected + owner-verified
      unchanged; cross-tenant INSERT → rejected by RLS (asserts /row-level
      security/ so it can't pass for an FK/NOT-NULL reason); pooling (pool max:1)
      two sequential different-context txns on the SAME connection do not leak.
  Red-check (ground rule 1): weakened the assessments policy to USING(true) on
    the test DB → 6/7 FAILED (the mitigations-only child test correctly still
    passed) → restored the policy.
  SAFE TO LAND NOW / INERT UNTIL ROLE SWITCH: the app still connects as owner
    (postgres) on staging → owner bypasses RLS → zero behavior change until the
    user points DATABASE_URL at the non-owner role (the checkpoint below).
  Tests: 222 server unit + 144 client + 33 integration (was 26, +7) green via
    `TEST_DATABASE_URL=... make test`.
  === CHECKPOINT FOR USER (Supabase dashboard) ===
    Create a NON-OWNER app role on Supabase + GRANT it DML on the public tables
    (NOT owner, NOT BYPASSRLS), then point the app's DATABASE_URL user at it.
    Until then RLS is enforced only in tests. SQL handed separately.
  === HANDOFF: P2 REMAINING (next session) ===
  Items 1 (route matrix), 2 (introspection), 4-DB (RLS policies+tests) DONE.
  Still TODO in P2:
    - RLS app wiring: wrap every request (reads too) in a txn that runs
      set_config('app.current_facility_ids', <resolved ids>, true) and thread the
      request-scoped trx through the repos (db singleton → request trx). Reuse
      facilityScopeFor to resolve the id list. Only meaningful once the non-owner
      role is live (checkpoint above).
    - Reconcile AGENTS.md invariant 2 wording (demo gating driven by
      VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.

================================================================

2026-07-03 — P2 (cont.): route-guard introspection test (test-specs §P2 deliverable 1)
  The "no unguarded route can be merged" regression guard.
  Added:
    - tests/middlewareCoverage.test.js (18 cases, UNIT loop — needs no DB, so it
      gates every `npm test`/commit, not just when TEST_DATABASE_URL is set).
      Walks app._router.stack; per data route asserts `authenticate` present
      (router-level or per-route) AND (`requireFacilityAccessMiddleware` present
      OR the method+path is in an in-test REPO_SCOPED_ALLOWLIST with a named
      scoping getter). Structural guards: any /api mount not classified as
      data/non-data fails; any stale allowlist entry (route removed, exemption
      left behind) fails.
  Decision (the wiring question the handoff flagged): requireFacilityAccess is
    wired into ZERO routes because by-id routes carry no facilityId in the
    payload — the middleware has nothing to check pre-load. Accepted a TWO-guard
    model: middleware for payload-facility routes (P3 writes), repo-scoped getter
    (getXForUser → null → 404) for by-id routes. Recorded in
    docs/decisions/2026-07-03-repo-scoped-facility-access.md; AGENTS.md invariant
    1 reworded to accept both; requireFacilityAccess's returned fn NAMED
    (requireFacilityAccessMiddleware) for stack-walk detectability.
  Red-check (ground rule 1): dropped an allowlist exemption → that route's
    facility assertion FAILED; injected a fake allowlist key → stale-entry guard
    FAILED; unclassified a real mount → classification guard FAILED. All reverted.
  Tests: 222 server unit (was 204, +18) + 144 client + 26 integration green via
    `TEST_DATABASE_URL=... make test`. Service coverage gate held (97%+).
  === HANDOFF: P2 REMAINING (next session) ===
  Items 1 (route matrix) + 2 (introspection test) DONE. Still TODO in P2, in order:
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase connects as owner/postgres → RLS bypassed). (a) migration
       creating policies keyed on a per-txn setting (SET LOCAL app.current_facility_ids
       / current_operator_id), (b) app wraps requests in a txn that SETs that
       context, (c) Supabase dashboard step to create+grant the non-owner role +
       point DATABASE_URL user at it → CHECKPOINT WITH USER. Test as the non-owner
       role via the harness (test-specs §P2 deliverable 4: no-context→0 rows,
       cross-tenant UPDATE→0 rows, sequential SET LOCAL on same pooled conn no leak).
    4. Reconcile AGENTS.md invariant 2 wording (demo gating driven by
       VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.
  Local test DB up: docker vantage-db (pgvector), database vorge_test. Re-run:
    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 (cont.): cross-tenant ROUTE matrix (test-specs §P2 deliverable 2)
  Built the penetration proof at the HTTP edge — supertest driving the live
    middleware+route stack against REAL Postgres (the P2 harness).
  Added:
    - tests/integration/session.js: auth helper. login(userKey, actingRole)
      loads the seeded user, mints a REAL session via sessionService.issueSession
      {mfaSatisfied:true}, then jwt.sign {email,actingRole,sid} subject=userId
      with env.jwtSecret — byte-for-byte the login route's signSessionToken.
      withAuth() attaches Authorization: Bearer + X-Acting-Role (and can force
      an unassigned role to prove ROLE_NOT_ASSIGNED).
    - tests/integration/tenantIsolation.test.js (17 cases): Op-A user targeting
      Op-B resources → GET :id 404 (ASSESSMENT_NOT_FOUND, no existence leak),
      sibling-facility-same-operator 404, list returns own-tenant rows only,
      POST workflow + POST mitigations/:id/log cross-tenant → 404 AND the target
      DB row asserted UNCHANGED (state/lock_version/status/progress-log count).
      Wrong-role 403 (ROLE_NOT_ALLOWED on workflow/admin/mine + ROLE_NOT_ASSIGNED
      on an unheld acting role); unauthenticated 401 on GET/GET:id/POST. HQ Exec
      §17.5 portfolio: Op-A HQ sees all Op-A facilities, ZERO Op-B (+ Op-B mirror).
      Covers every data route that exists today; mutation matrix EXTENDS when P3
      write endpoints land (recorded in test-specs §P2).
  Red-check (ground rule 1): flipped the cross-tenant GET expectation to 200 →
    the test FAILED (route really returns 404) → reverted. (Could not neuter the
    repo guard directly — the harness classifier blocks weakening prod access
    control, which is the correct posture; the assertion-flip proves liveness.)
  Tests: 204 server unit (unchanged) + 144 client + 26 integration (was 9, +17)
    green via `TEST_DATABASE_URL=... make test`.
  === HANDOFF: P2 REMAINING (next session) ===
  Item 1 (cross-tenant route matrix) DONE this session. Still TODO in P2, in order:
    2. Route-guard introspection test (middlewareCoverage.test.js): walk
       app._router.stack; assert every data route has authenticate +
       (requireFacilityAccess OR a documented repo-scoped-getter allowlist
       entry). NOTE decision needed: assessment/mitigation :id routes enforce
       facility at the REPO layer (getXForUser → null → 404), NOT via
       requireFacilityAccess middleware (facilityId isn't in the request
       pre-load). Plan: refine AGENTS.md invariant 1 wording + write a
       docs/decisions record for the repo-scoped-getter equivalent; name
       requireFacilityAccess's returned fn for detectability.
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase currently connects as owner/postgres → RLS bypassed).
       (a) migration creating policies keyed on a per-txn setting (SET LOCAL
       app.current_facility_ids / current_operator_id), (b) app wraps requests
       in a txn that SETs that context, (c) Supabase dashboard step to
       create+grant the non-owner role + point DATABASE_URL user at it →
       checkpoint with user. Test as the non-owner role via the harness.
    4. Reconcile AGENTS.md invariant 2 wording (demo gating driven by
       VITE_ENABLE_DEMO, not import.meta.env.DEV) — align doc or code, record.
  Local test DB up: docker vantage-db (pgvector), database vorge_test. Re-run:
    TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 (cont.): SQL-scoped assessment list + mitigations hardcode fix
  - assessmentRepository.listAssessmentsForUser: new facilityScopeFor(user,
    actingRole) builds facility_id/operator_id WHERE from the acting role's
    assignments (Author→own facilities; HQ→operator; cross-facility Admin→
    operator). Default-deny: empty scope returns [] with no query. Replaces
    fetch-all-then-filter-in-JS. Verified identical results to the old filter
    (integration tenantIsolation.repo.test.js still green).
  - mitigations/routes.js: replaced hardcoded hasFacilityAccess:true with
    canAccessFacility(...) on the loaded mitigation (2026-06-04 audit item).
  Tests: 204 server unit + 144 client + 9 integration green.
  === HANDOFF: P2 REMAINING (next session) ===
  Still TODO in P2, in order (see docs/test-specs.md §P2 + docs/roadmap.md):
    1. Cross-tenant ROUTE matrix (supertest + real DB): the penetration
       proof. Harness ready; need an auth helper that mints a real session
       (sessionService.issueSession {mfaSatisfied:true} → jwt.sign
       {email,actingRole,sid} sub=userId with env.jwtSecret) then supertest
       with Authorization: Bearer + X-Acting-Role. Assert cross-tenant GET
       :id → 404, POST workflow/log cross-tenant → 404, wrong-role → 403,
       unauthenticated → 401, list returns only own-tenant rows.
    2. Route-guard introspection test: walk app._router.stack; assert every
       data route has authenticate + (requireFacilityAccess OR a documented
       repo-scoped-getter allowlist entry). NOTE decision needed: assessment/
       mitigation :id routes enforce facility at the REPO layer (getXForUser
       → null → 404), NOT via requireFacilityAccess middleware (facilityId
       isn't in the request pre-load). Plan: refine AGENTS.md invariant 1
       wording + write a docs/decisions record for the repo-scoped-getter
       equivalent; name requireFacilityAccess's returned fn for detectability.
    3. RLS policies (defense-in-depth, biggest piece): needs a NON-OWNER app
       DB role (Supabase currently connects as owner/postgres → RLS bypassed).
       Requires (a) a migration creating policies keyed on a per-txn setting
       (SET LOCAL app.current_facility_ids / current_operator_id), (b) the app
       wrapping requests in a txn that SETs that context, (c) a Supabase
       dashboard step to create+grant the non-owner role and point the app's
       DATABASE_URL user at it. Likely needs a user dashboard action → plan to
       checkpoint before/after. Test as the non-owner role via the harness.
    4. HQ operator-portfolio scoping tests (§17.5) in the route matrix.
  Local test DB is up: docker pgvector db, database vorge_test. Re-run P2
    tests: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test \
    npm --prefix server run test:integration

================================================================

2026-07-03 — P2 START: integration harness + two-operator fixture + first isolation test
  Built the P2 foundation (docs/test-specs.md §P2 deliverable 0) against a
    REAL local Postgres (docker pgvector db, database vorge_test).
  Added:
    - server/jest.integration.config.js (separate from unit config).
      package.json: testPathIgnorePatterns adds /tests/integration/ so the
      default `npm test` stays DB-free + fast; new `test:integration` script.
    - tests/integration/requireTestDb.js (fail-loud if TEST_DATABASE_URL
      unset — verified it errors, never silently skips), env-setup.js (maps
      TEST_DATABASE_URL→DATABASE_URL, no SSL, NODE_ENV=test, before modules
      load), global-setup.js (knex migrate:latest on the test db).
    - tests/integration/fixtures.js: two operators × two facilities;
      Author+Reviewer per facility; HQ Exec/Approver/Mitigation Owner/
      cross-facility Admin per operator; one assessment per facility with
      asset/threat/link/evaluation/mitigation. Deterministic UUIDs.
      truncateAll + seedFixtures.
    - tests/integration/tenantIsolation.repo.test.js (9 cases): proves
      repo-layer isolation on real Postgres — Author sees only own facility;
      HQ sees own operator's facilities only; cross-facility Admin sees own
      operator only; getAssessmentForUser cross-tenant/sibling → null; scoped
      bundle returns only the target's rows.
    - scripts/test.sh: runs integration when TEST_DATABASE_URL set, else a
      prominent WARNING banner (deviation from spec's "make test fails loud",
      recorded in test-specs §P2 — keeps the DB-free unit loop usable while
      making a non-run impossible to miss).
  Local test DB setup (one-time): docker compose up -d db (pgvector/pgvector
    :pg16); CREATE DATABASE vorge_test TEMPLATE template0 (template0 avoids a
    harmless collation-version warning from the volume's old image).
  Tests: 204 server unit (unchanged) + 144 client + 9 integration, all green
    via `TEST_DATABASE_URL=... make test`.
  Next (P2 continued): route-guard introspection test → wire authenticate +
    requireFacilityAccess on data routes (or documented repo-scoped allowlist)
    → push listAssessments scoping into SQL → RLS migration + non-owner app
    role + policies → full cross-tenant route matrix → fix mitigations
    hasFacilityAccess:true hardcode. Checkpoint for review at phase end.

================================================================

2026-07-03 — P0 COMPLETE: staging cross-site smoke passed
  User finished all infrastructure.md dashboard steps. Verified staging
    end-to-end from the agent (no browser):
    - Render https://vorge-api-staging.onrender.com /health 200.
    - Vercel https://vorge-app.vercel.app 200.
    - Login (Author, no MFA) 200; CORS allow-origin=vercel app +
      allow-credentials=true; Set-Cookie vorge_refresh HttpOnly; Secure;
      SameSite=None (the P0 cookie fix, confirmed live).
    - GET /api/assessments with token+acting-role returns the 3 seeded
      assessments → Render→Supabase transaction pooler path works.
    - POST /api/auth/refresh with the cookie issues a new token →
      cross-site idle-refresh works.
  Not exercised: MFA enroll/verify browser flow (optional eyeball; all
    cross-origin plumbing it depends on is verified). P0 marked complete
    in roadmap + production-status.
  Interim posture noted: staging uses the Vercel URL; vorge.io per-client
    portal routing deferred (memory: vorge-io-portal-routing).
  Next: commit pending fixes (seed contributors JSONB + the two dotenv
    path bugs, with a test) then start P2 (tenant isolation) — harness first.

================================================================

2026-07-03 — P0 staging: migrate + seed against Supabase (vorge-staging)
  Ran migrations and seed against the real Supabase project from the
    developer machine (user had saved root .env, gitignored).
  Migrate: 7 migrations applied (initial schema + 5 auth-chunk migrations
    + 202607030001_enable_pgvector). pgvector extension confirmed enabled;
    22 public tables. Seed: 1 operator / 2 facilities / 6 users / 11 role
    assignments / 3 assessments / 2 assets / 2 threats / 2 mitigations.
  Two blockers fixed en route:
    - DNS: MIGRATE_DATABASE_URL pointed at the DIRECT host
      (db.<ref>.supabase.co) which has no A record here (IPv6-only) →
      ENOTFOUND. Switched MIGRATE_DATABASE_URL to the SESSION POOLER
      (pooler host, port 5432; IPv4). Runbook already anticipated this.
      Done in .env only (gitignored); backup in scratchpad.
    - Seed data bug (the known chunk-4 deferred item "assessments
      .contributors JSONB"): JS arrays passed to a jsonb column are
      serialized by node-pg as a Postgres array literal ({...}), which
      Postgres rejects as invalid JSON (22P02). Fixed by JSON.stringify()
      on all 3 contributors values in src/db/seed.js. Verified stored as
      real JSON arrays via jsonb_array_length. **UNCOMMITTED** — flagged
      for review (not committed; user hasn't asked to commit this pass).
  Latent bugs found (NOT fixed this pass — need their own change + test):
    - src/config/env.js loads dotenv with path "../../.env" (relative to
      cwd, not the file) → from server/ that resolves ABOVE the repo root
      and loads nothing; app/seed via `npm run` fell back to localhost DB.
      Worked around by preloading dotenv (node -r dotenv/config
      dotenv_config_path=../.env). Invisible in Docker/Render because env
      vars are injected directly. Recommend fixing the path + a test.
    - knexfile.js uses "../.env" (correct only because knex CLI runs with
      cwd=server/). Both paths are cwd-fragile; worth normalizing.
    - Root .env has duplicate NODE_ENV and DATABASE_URL keys (dev at top,
      staging appended at bottom); dotenv resolves last-wins so effective
      values are correct, but it is fragile — recommend de-duping.
  Secrets: local .env JWT_SECRET (was still the placeholder) + missing
    MFA_ENCRYPTION_KEY set to fresh random 32B values so the production
    boot guard passes for seed (local-only, never printed/committed).
    Separate fresh secrets generated + printed to the user for Render.
  Next (user): create Render (Docker, single instance, /health, envs incl.
    COOKIE_SAME_SITE=none + DATABASE_URL=transaction pooler:6543) and the
    new Vercel client project; then the §7 staging smoke.

================================================================

2026-07-03 — P0 infra grounding: code/config changes (Supabase/Render/cross-site ready)
  Follows same-day planning session (entry below; planning commit 9b57bf4).
  Shipped (server + infra config; NOT yet committed — stop-for-review):
    - server/knexfile.js: migrations prefer MIGRATE_DATABASE_URL (direct/
      session string for Supabase; the app's transaction-pooler string is
      unsuitable for migration locks); SSL { rejectUnauthorized: false }
      when NODE_ENV=production or DATABASE_SSL=true (CA pinning → P5).
      Knexfile is CLI-only; app/seed connect via src/db/knex.js.
    - server/src/db/knex.js: SSL via new env.databaseSsl (DATABASE_SSL,
      defaults ON in production, OFF elsewhere).
    - server/src/config/env.js: cookieSameSite (COOKIE_SAME_SITE, default
      "strict", lowercased) with boot guard — rejects non strict|lax|none
      and rejects none-without-Secure (browsers drop such cookies);
      databaseSsl as above.
    - Cookie fix (4 sites): refresh set/clear in modules/auth/routes.js +
      MFA-trust set/clear in services/mfaTrustDeviceService.js now use
      env.cookieSameSite instead of hardcoded "strict". NOTE: supersedes
      chunk-4 lockbox "SameSite=Strict locked" — cross-site Vercel client
      ↔ Render API requires None; default unchanged (strict) so local/
      same-site behaviour is identical. Docblock updated in the service.
    - server/migrations/202607030001_enable_pgvector.js: CREATE EXTENSION
      IF NOT EXISTS vector; warn-and-continue if the binary is absent
      (old local containers) — nothing consumes it until P4. down() no-op
      by design (dropping would destroy P4 vector data).
    - docker-compose.yml: db image postgres:16 → pgvector/pgvector:pg16
      (drop-in; same data volume). Recreate the db container to pick up.
    - NEW server/tests/envCookieSameSite.test.js (+9 tests) covering the
      COOKIE_SAME_SITE / DATABASE_SSL guards via jest.isolateModules.
  NOT changed by agent (human-review rule): .env.example — diff handed
    to user (MIGRATE_DATABASE_URL, COOKIE_SAME_SITE, DATABASE_SSL).
  docs/infrastructure.md updated to match implementation (seed needs
    DATABASE_URL + prod boot-guard secrets exported; migrate needs
    MIGRATE_DATABASE_URL; SSL automatic under NODE_ENV=production).
  Tests: 201 server (was 192, +9), 144 client, all green (make test).
  Committed: 4e7f932 (P0 code), after planning commit 9b57bf4.
  Addendum (same day, user directive): future phases will be executed by
    weaker models, so every phase now has a BINDING acceptance-test spec —
    NEW docs/test-specs.md (ground rules incl. red→green + two test layers;
    P2 integration harness + route-guard introspection + cross-tenant
    matrix + SQL-scoping + RLS-as-non-owner tests; P3 six-case minimum per
    endpoint + true-race lock_version + atomic audit + client 409 UX; P3.5
    docx golden-content; P4 mocked-gateway ceilings/audit/scoping + the
    aiImportBoundary scan test enforcing §9's no-direct-provider rule
    mechanically; P5 email loop/retention/Redis-swap/PII-scrub). Roadmap
    phases got DoD pointer lines; AGENTS.md invariant 3 now binds phase
    completion to test-specs (no ticking without green spec'd tests).
  Next: USER performs dashboard steps per docs/infrastructure.md §§1,4–7
    (Supabase project + pgvector, migrate+seed, Render service, new
    Vercel project); P0 exits on the §7 smoke. Then P2 (harness first).

================================================================

2026-07-03 — Production-push planning docs (P0–P5 roadmap, infra runbook, decisions)
  Planning-only session (no code). Locked decisions recorded: Supabase =
    managed Postgres only (custom JWT/bcrypt/MFA auth KEPT — no Supabase
    Auth); server = Render web service from server/Dockerfile (single
    instance; in-memory rate-limit/MFA caches); real client = NEW Vercel
    project (VITE_ENABLE_DEMO=false), vorge-demo-roles untouched; AI =
    Vercel AI Gateway + AI SDK behind an app-layer module.
  Files created:
    docs/roadmap.md — P0 infra / P1 auth-done / P2 tenant isolation /
      P3 write-section API / P4 AI / P5 hardening + dark-mode side-quest,
      PLUS "Suggested improvements & new features" review (per-area
      exists/partial/missing + prioritized suggestions, each tagged
      SCHEDULED / BACKLOG / NEEDS DECISION).
    docs/infrastructure.md — click-by-click runbook: Supabase project +
      pgvector + pooled(6543)/direct connection split, Render setup,
      second Vercel project, full env-var tables, migrate/seed steps.
    docs/decisions/2026-07-03-supabase-postgres-keep-custom-auth.md (LOCKED),
    docs/decisions/2026-07-03-ai-gateway-ai-sdk.md (§9 deviation —
      PENDING SIGN-OFF; businesslogic.md NOT edited),
    docs/decisions/2026-07-03-write-section-api.md (api-contract
      extension — PENDING SIGN-OFF; api-contract.md NOT edited).
  Files edited: AGENTS.md + CLAUDE.md (doc-update rule now includes
    ticking docs/roadmap.md on every meaningful change + before commits;
    current-focus → P0), docs/production-status.md (pointer to roadmap).
  Key findings baked into P0/P2 plans:
    - refresh + MFA-trust cookies hardcoded sameSite:"strict" → will
      silently break cross-site (Vercel↔Render); COOKIE_SAME_SITE env
      fix is a P0 item.
    - requireFacilityAccess middleware wired into ZERO routes; scoping
      lives only in repo-level canAccessFacility JS filters (listAssessments
      fetches ALL rows then filters in JS) — P2.
    - RLS ENABLEd since initial migration, zero policies; app DB role
      must be non-owner + SET LOCAL pattern for pooled conns — P2.
    - No write endpoints at all; no column for Section 1/2/8 text — P3.
  Tests: not run (docs only).
  Same-day approval: user signed off BOTH decisions (§9 AI deviation +
    write-section API), plus P3 scope additions (withdraw/recall +
    reassignment, mitigation assignment) and Word/PDF export pulled
    forward to P3.5. Records + roadmap updated to APPROVED/SCHEDULED.
  Next: commit planning docs, then P0 execution (knex SSL +
    MIGRATE_DATABASE_URL, pgvector migration, COOKIE_SAME_SITE fix,
    .env.example diff for human review) — agent code + user dashboard
    steps per docs/infrastructure.md. Stop for review at end of P0.

================================================================

2026-06-04 — Strategic roadmap created (docs/roadmap.md)
  [Editor's note, 2026-07-03 merge: the file below now lives at
   docs/strategic-roadmap.md — docs/roadmap.md was re-created that day
   as the production-push execution checklist. Findings folded into
   roadmap P2. Entry otherwise preserved verbatim.]
  Repo-wide retrospective audit synthesized into one living strategic
    roadmap. Read-only audit of client + server + migrations + tests
    against the canonical docs; no behavior changes.
  Shipped: docs/roadmap.md — 10 sections (exec snapshot, v1 DoD,
    themed retrospective, current-state matrix with evidence paths,
    Now/Next/Later/Deferred horizons, engineering enablers, mermaid
    dependency graph, open questions, feature-inventory appendix,
    maintenance instructions).
  Key audit findings (grounded in code, not docs):
    - P0 tenant isolation: requireFacilityAccess middleware EXISTS but
      is wired to NO data route (assessments/mitigations use only
      authenticate); scoping is JS filtering in repos
      (listAssessmentsForUser fetches ALL rows then .filter()s);
      mitigations route hardcodes hasFacilityAccess:true; RLS ENABLEd
      on 7 tables with ZERO policies (no-op under the postgres owner
      role); cross-tenant tests cover the AUTH domain only — data
      routes mock the repos so the filter is never exercised e2e.
    - Architecture truth: client is a fixtures prototype (only auth
      hits the API); server is real but partial (auth full + DB-backed;
      assessment/mitigation read+workflow DB-backed; NO content CRUD,
      audit-read, admin CRUD, exports, or AI service module).
    - Exports absent (no docx/pdf lib; alert() stubs). AI = AD-1 only
      plus stubs/heuristics. Dark mode ~52% (no prefers-color-scheme).
    - Demo gating uses VITE_ENABLE_DEMO, not import.meta.env.DEV as
      AGENTS.md invariant #2 states — flagged to reconcile.
  Also updated docs/production-status.md: added "See also:
    docs/roadmap.md" row to the Planning layers table; resolved the
    Exports row (To confirm -> Not started, evidence-backed); bumped
    Last updated to 2026-06-04.
  Tests: make test green (exit 0) — 192 server (13 suites; coverage
    99.82% stmts / 95.85% branch / 100% funcs+lines, 95% gate passes)
    + 144 client (10 files, 80% gate) = 336 passing.
  Next: finish dark mode; Phase 2 (route-level requireFacilityAccess,
    SQL repo scoping, cross-tenant data-route 403/404 tests).

================================================================

2026-06-02 — Rebrand: Vorge (full code + assets + docs)
  Trademark/identity conflict with a UK company → renamed Vantage to
    Vorge across the entire codebase. Same product, same lockup style;
    new wordmark and slightly lighter brand amber (#F4B860 vs #F49D0D).
  Scope: ~325 hits across ~80 files. Bulk sed (case-sensitive, both
    forms) across client/, server/, docs/, scripts/, .claude/hooks/,
    AGENTS.md, CLAUDE.md, README.md, SESSION_LOG.md, Makefile.
  Intentional kept-as-vantage items (3):
    - server DATABASE_URL default DB name → kept "vantage" (env.js +
      knexfile.js) so Docker/Postgres still works without recreating
      the database. docker-compose POSTGRES_DB and container names
      left untouched for the same reason.
    - .env.example untouched (human review per user instruction).
    - Drive .docx references in docs/ (Vantage_User_Flows.docx etc.)
      reverted post-sed — the actual Drive files have NOT been renamed,
      so the references must keep pointing at the real filenames.
  Logo / favicon:
    - Copied 2 new SVGs in from /Volumes/.../vorge logo/ → renamed to
      client/src/assets/vorge-logo-on-{light,dark}.svg.
    - Deleted old vantage-logo-on-{light,dark}.{svg,png}.
    - Created client/public/favicon.svg by viewBox-cropping the
      light SVG to 0 0 37 37 (mark only), linked in client/index.html.
  Storage keys (Q1 override = migration shim, NOT hard cut):
    - New central client/src/config/storageKeys.js with all keys.
    - client/src/config/legacyStorageMigration.js — one-shot, idempotent,
      best-effort. Called from main.jsx before React mounts.
    - Migrates: vantage.session, vantage.session.token, vantage-theme,
      vantage:demo:mobile-gate-dismissed, vantage:op:* → vorge.* counterparts.
    - 5 new vitest cases in legacyStorageMigration.test.js.
    - Existing consumers (AuthContext, useTheme, useOperatorMemory,
      computeInitialDismissed, MfaEnrollPage) now import from the
      central file.
  Server cookies (one release window dual-read):
    - env.js: added legacyRefreshCookieName ("vantage_refresh") and
      legacyMfaTrustCookieName ("vantage_mfa_trust"). Writes/clears
      use the new names; reads fall back to legacy if new absent.
    - 4 read sites updated: 3 in modules/auth/routes.js, 1 in
      services/mfaTrustDeviceService.js. Drop after one release.
  CTA cohesion (Q2 default): LoginPage dark-mode Sign-in button
    dark:bg-[#F49D0D] → #F4B860 to match the new brand mark. Hover
    stays #FFB020. Both Demo + Prod login variants.
  Tests: 144 client passing (was 139 — +5 migration tests), 192 server
    passing (unchanged). Client build clean.
  Deferred (Q3 + infra): website/ (gitignored homepage generator,
    62 hits) and Drive .docx renames — separate user-controlled work.
    GitHub repo, Vercel project name, local directory rename are
    user UI/CLI work outside any commit. All logged in
    considered-and-deferred.md.
  Next: commit + push (per overrides); do NOT vercel --prod unless
    user asks.

================================================================

2026-06-01 — Demo facility rename (de-identification)
  Three mock facilities reused names of real refineries/terminals.
    Renamed for de-identification:
      Lagos Refinery         → Eko Petrochemical Hub
      Bonny Terminal         → Delta Crest Terminal
      Fujairah Marine Terminal → Gulf Horizon Terminal
    "Eko" is Yoruba for the Lagos area; the others are fully fictional.
  Approach: literal-text sed across client/src/{**/*.js,**/*.jsx} +
    one manual update to the case-insensitive regex in
    AuthorDashboard.test.jsx (findLagosRow → findEkoRow; /lagos refinery/i
    → /eko petrochemical hub/i ×2). Replaced FULL multi-word names only
    — no collisions, no accidental matches in identifiers.
  Scope: 94 occurrences across 16 files (client/src ONLY — server/docs
    clean). Source-of-truth: auth/session.js (DEMO_FACILITY,
    DEMO_SESSION.facilities) + data/operators.js (FACILITIES, prod-shape).
    Derived strings cascaded: data/{auditLog,notifications,assessments,
    admin,mitigations}.js (33+11+9+9+6=68 hits), the assessment-name
    suffixes (e.g. "Lagos Refinery — 2026 SRA" → "Eko Petrochemical Hub
    — 2026 SRA"), plus dashboard, modal, and section display strings.
  Defaults accepted (Q1–Q3 from plan):
    - Q1 KEEP region strings ("Lagos, Nigeria" etc.) and regulator
      strings — geographic verisimilitude consistent with "Eko" = Lagos.
    - Q2 LEAVE accountableManager names (Daniel Mensah, Hassan
      Al-Mansoori, Nadia Haddad) — geographically consistent with Q1.
    - Q3 LEAVE fac-4 Pernis Refinery Complex + fac-5 Jurong Storage
      Terminal — also real-place names but you scoped to 3 facilities;
      logged in considered-and-deferred for a follow-up.
  Key files: 15 modified via sed + AuthorDashboard.test.jsx via Edit.
  Tests: 139 client passing (unchanged — data rename, no behaviour).
    Build clean.
  Decision record: product-decision-log.md narrative entry (defect-fix
    tone). Deferred: Pernis + Jurong rename, full region/regulator
    anonymization — both in considered-and-deferred.md.
  Next: commit + push (per standing prefs); deploy at user's call.

================================================================

2026-05-29 — AD-1: anomaly acknowledgement on Section 3 assets
  Spec (businesslogic §9.2) defines real-time anomaly detection as a paid
    recurring add-on with a flag → acknowledge (4 reasons) → audit loop.
    Demo had only the rule (detectAssetAnomaly) rendered as a passive
    amber note — no acknowledge loop. AD-1 adds the Author-facing loop
    (the demo-sellable mechanic); backend engine/debounce/other sections
    deferred to AD-2+.
  Shipped (client-only, advisory — never blocks workflow):
    - useAnomalyAcknowledgement hook: rule call + per-Author validity via
      a criticality/consequences SNAPSHOT (editing either field auto-
      invalidates the ack and re-fires the warning; no explicit clear).
      Rule id "asset-criticality-consequences"; keyed by session.user.id.
    - AnomalyWarningChip (tokens only — semantic-warning + text-*; no new
      zinc): warning state with Acknowledge button; muted "acknowledged
      — {reason}" state after dismissal (kept visible for transparency).
    - AnomalyAcknowledgeModal: reuses shared (tokenized) Modal; reasons
      Not applicable / False positive / Will address / Other (note
      required iff Other).
    - WorkspaceContext.acknowledgeAnomaly: writes the ack snapshot onto
      the asset + appends an "anomaly-ack" audit entry atomically (mirrors
      addComment). Lowercase-hyphen action, matching existing vocab.
    - Wired into AssetDisaggregationSection (ExpandedAssetRow); Acknowledge
      hidden when readOnly (non-Author or non-Draft).
  Defaults accepted (Q1–Q3): per-Author key on the asset (demo assets are
    workspace-global, so "per-assessment" is approximated — v1 limitation);
    soften (not hide) acknowledged chip; lowercase "anomaly-ack" audit.
  Key files: client/src/components/AnomalyWarningChip.jsx;
    client/src/features/assessmentWorkspace/{useAnomalyAcknowledgement.js,
    AnomalyAcknowledgeModal.jsx}; edits to AssetDisaggregationSection.jsx
    + WorkspaceContext.jsx. Tests: client/src/data/assets.test.js (7) +
    AssetDisaggregationSection.test.jsx (2 RTL).
  Tests: 139 client passing (was 130 — +9). Build clean.
  Decision record: product-decision-log.md AD-1 entry (incl. AD-1→AD-4
    arc table). Advisory-only — does not gate submit/review/approve.
  Deferred (handoff): AD-2 (Sections 5/6 + server engine/debounce),
    AD-3 (admin dismissal-rate tuning), AD-4 (cross-facility); admin
    enable toggle (none wired today — always-on for demo).
  Next: commit (done); push is user's call.

================================================================

2026-05-29 — LoginPage dark-mode brand contrast + real logo
  QA: in dark mode the Vorge wordmark, "Sign in to continue" heading,
    and primary Sign-in button were all brand-navy on near-navy bg —
    low contrast, weak brand, unclear CTA. Placeholder Lucide shield
    still in use instead of a real logo.
  Key finding (changed the approach): the repo ALREADY had designer-made
    theme-correct logo SVGs in client/src/assets/ —
    vorge-logo-on-light.svg (black wordmark) + vorge-logo-on-dark.svg
    (white wordmark), added 2026-05-12, never wired into LoginPage. So
    the planned JPEG processing (crop mark / strip white bg) was
    unnecessary; the provided PNG is superseded.
  Shipped (Option 3 — gold CTA + lighter-navy heading):
    - Brand lockup: replaced Lucide shield + "Vorge" text with the
      existing SVGs, swapped by theme (block dark:hidden / hidden
      dark:block), h-8. "SRA Platform" stays token text. Applied to BOTH
      DemoLoginPage and ProdLoginPage lockups.
    - Heading: + dark:text-primary-300 (#7B99B3 lighter navy).
    - Sign-in button: dark-mode brand-amber #F49D0D bg + dark-navy text
      (#070E16) + #FFB020 hover + transparent border. Brand gold matches
      the logo square. LOCAL dark: utility (not a token) to keep the
      gold CTA scoped to LoginPage — a global token would leak it to
      every primary button.
  Decisions: white wordmark (designer asset as-is, not recoloured);
    gold = brand-mark amber over semantic-warning/lighter-amber; no new
    design tokens (Tailwind dark: + existing primary ramp).
  Key files: client/src/pages/auth/LoginPage.jsx;
    client/src/assets/vorge-logo-on-{light,dark}.svg (existing, wired).
  Tests: 130 client passing (unchanged — visual-only). Build clean.
  Visual QA: NOT human-verified in this env (static change). Needs a
    desktop+mobile light/dark eyeball before relying on it.
  Decision records: product-decision-log.md (structured entry) +
    considered-and-deferred.md (gold-CTA-app-wide; mark-only asset).
  Deferred: gold CTA app-wide + promote #F49D0D to an action token;
    mark-only logo asset for compact contexts.
  Next: commit + push; deploy is user's call after visual verification.

================================================================

2026-05-29 — Fix: tokenize auth-page bg-white surfaces (dark-mode contrast)
  QA (real phone, dark mode) surfaced unreadable text in the LoginPage
    demo role-picker modal right after the zinc migration (a05da19).
  Root cause: the migration tokenized the text (text-text-primary etc.,
    which flip light in dark mode) but left the co-located surfaces as
    hardcoded bg-white (never themes). Result in dark mode: light text
    on a white card = unreadable. A half-migrated surface — the exact
    risk the scoping report flagged. NOT a missed zinc class (zinc sweep
    was clean) and NOT viewport-driven: the modal has zero responsive
    prefixes. The "mobile only" symptom was per-device localStorage —
    that phone had vorge-theme=dark stored from a prior logged-in
    session; the app still doesn't honor prefers-color-scheme, so dark
    mode on /login is localStorage-driven.
  Fix: migrated all 6 bg-white in auth pages to surface tokens —
    LoginPage role-picker modal → bg-surface-overlay (dialog-over-scrim
    elevation), LoginPage demo-bypass button + MfaEnroll QR/recovery
    boxes + MfaSettings 2 sections → bg-surface-raised. All surface
    tokens are #FFFFFF in light (zero light-mode change) and dark
    grays in dark mode (readable with the light text tokens).
  Scope: stayed entirely in auth-page files (no shared components /
    Chunk B). Completes the auth-page surface migration left half-done
    by the zinc-only sweep.
  Note/assumption: MfaEnroll QR box is now a dark surface in dark mode;
    the QR PNG carries its own white background so it stays scannable
    (the dark box is only the padding ring). Verify if real-auth MFA
    enroll is ever exercised in dark mode.
  Key files: LoginPage.jsx, MfaEnrollPage.jsx, MfaSettingsPage.jsx.
  Tests: 130 client passing (unchanged — visual-only). Build clean.
  Only zinc left in auth: LoginPage:179 modal scrim (deferred by
    decision; theme-agnostic).

================================================================

2026-05-29 — Doc catch-up + dark-mode Chunk A (auth pages)
  Catch-up (closing a grounding gap — SESSION_LOG was one beat behind):
    - 2026-05-28/29 doc setup landed: docs/production-status.md created
      (the living map; SESSION_LOG stays the diary), CLAUDE.md replaced
      + line-11 typo fixed, AGENTS.md updated (Phase 1 ✅ / Phase 2 ⬅,
      doc-update bullet under "Before committing"), .claude/hooks/
      pre-commit.js extended with a non-blocking doc-update WARNING.
      Commits 85105a7, 4c6334c (pushed).
    - Dark-mode Chunk A was attempted on 2026-05-28 then reverted before
      review (no shipped code; working tree returned to 5bbf903). The
      plan file ~/.claude/plans/vorge-phase-1-pure-kernighan.md remains
      valid as the forward plan.
    - Parked, still open: critical-severity dark text awaiting designer
      sign-off (#FF5C61, already AA-passing — non-code blocker); Vercel
      "not a member of the team" deploy email — watching for recurrence.
  Chunk A landed (this session): zinc→token migration on the 7 auth
    pages (LoginPage, ForgotPassword, ResetPassword, MfaVerify,
    MfaEnroll, MfaLockout, MfaSettings). Narrow scope by decision —
    toggle-on-auth and prefers-color-scheme split out to future chunks
    (last night's bundling caused complication).
    Mapping: text-zinc-900/700→text-text-primary, 500→text-text-muted,
    400→text-text-disabled; border-zinc-200→border-border-default,
    300→border-border-strong; bg-zinc-200(dividers)→bg-border-default,
    bg-zinc-50→bg-surface-sunken, hover:bg-zinc-100→hover:bg-surface-muted.
    Left literal by decision: LoginPage role-picker modal scrim
    bg-zinc-900/30 (theme-agnostic dark overlay; no --scrim token, and
    surface-inverse would flip white in dark). bg-white untouched
    (not a zinc class; separate dark-mode gap).
  Key files: client/src/pages/auth/*.jsx (7 files).
  Tests: 130 client passing (unchanged — migration is visual-only, no
    class assertions). Production build clean.
  Visual: not human-verified in this environment. Light mode now uses
    the brand gray ramp (cool/navy-tinted) instead of Tailwind warm
    zinc — a subtle intended hue correction, not a regression. Dark
    mode on auth pages still won't activate pre-login until the toggle
    + prefers-color-scheme chunk ships (accepted for this chunk).
  Commits: 0a61faa (Task 1 catch-up) + this one (auth migration).

================================================================

2026-05-28 — Section 6 validation: human labels instead of raw eval IDs
  Phone QA surfaced: Section 6 validation banner read
    "Evaluation e-at-t5-1779934620202 is missing the risk scenario."
    — leaking the raw DB id to the user with no way to map it to a
    matrix cell. Section 6 was the only section with this gap;
    Section 3 (assets), Section 4 (threats), and Section 7 (mitigations)
    all already used human-readable labels.
  Fix: added evaluationLabel() in sectionValidation.js, mirroring the
    existing mitigationLabel() pattern in the same file. Resolves
    (assetId, threatId) to "the Asset N × <Threat> evaluation" via
    asset.name + threat.short/classification/name lookups with
    graceful fallbacks. Eval id is never used in user-visible text.
  New messages:
    - "The Asset 1 × Terrorism evaluation is missing the risk scenario."
    - "The Asset 1 × Terrorism evaluation has no R1 score."
  Codes unchanged (eval-scenario, eval-r1) so existing code-based
    consumers and tests still work.
  Files modified: client/src/features/assessmentWorkspace/sectionValidation.js
    (~15 lines added/changed), client/src/features/client.test.jsx
    (2 new test cases).
  Tests: 130 client passing (was 128 — +2 new). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → narrative entry
      "Section 6 validation messages use human labels". Captures
      symptom, root cause, fix, and the deferred follow-up.
  Followup deferred:
    - Deep-link errors to the offending matrix cell. Bigger refactor;
      threads richer error objects through ValidationSummary.jsx.
      Natural next step.
  Next: vercel --prod when user authorizes; re-verify on-device.
  Auth note (observed, not blocking): Received Vercel email at 02:25
    BST flagging a failed CLI deployment from GitHub identity
    279891108+Alora-ops@users.noreply.github.com to alora-ops projects
    ("not a member of the team"). Did not block the actual deploys,
    which succeeded under the alora-ops CLI session. Cause unclear —
    possibly a separate auth context (Claude Code's environment, stale
    GitHub Actions token, or a transient identity mismatch). Recorded
    for pattern-spotting; if recurs on future deploys, investigate
    auth setup.

================================================================

2026-05-28 — Author dashboard: whole-row tap target + per-mode landing
  Phone QA on live demo surfaced: Lagos Refinery row opens fine via
    desktop mouse click but ignores phone taps. Inspection: the <tr>
    had no onClick; the only interactive element was a tiny text-link
    button (text-[13px], no padding, hit-box ~15px tall) well below
    iOS's 44px touch-target minimum. Mouse precision-hit; finger taps
    missed.
  Fix shape: make the whole <tr> clickable (role="button", tabIndex=0,
    aria-label per assessment, Enter/Space keyboard handlers,
    cursor-pointer, focus-ring). Inner "Open →" button kept as visible
    affordance, with event.stopPropagation() so a button click doesn't
    double-navigate via the row.
  Product decision baked in: landing section now branches by demo flag.
    Production navigates to /sections/2 (Facility Info — current
    behaviour preserved exactly). Demo navigates to /sections/1
    (Executive Summary — natural reading order for cold prospects).
    Single openAssessment helper inside the row map keeps both
    handlers anchored to one source of truth.
  Files modified: client/src/pages/dashboards/AuthorDashboard.jsx
    (1 import, ~20 lines around the row block).
  Files added: client/src/pages/dashboards/AuthorDashboard.test.jsx
    (6 cases: demo-on click, demo-off click, button stopPropagation,
    Enter, Space-preventDefault, a11y attrs).
  Tests: 128 client passing (was 122 — +6 new). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → formal structured entry
      "Author dashboard — whole-row tap target + per-mode landing
      section". Captures touch-target rationale, demo vs prod audience
      reasoning, open question about last-viewed-section resume, and
      the deferred follow-up for Reviewer / Approver / HQ Executive /
      Mitigation Owner dashboards.
  Followup deferred:
    - Same small-target pattern likely lives on the other three
      dashboards. Flagged in product-decision-log; not in this chunk.
    - Should production Authors resume at last-viewed section instead
      of hardcoded section 2? Open question, deferred.
  Next: vercel --prod, real-device tap smoke at <1024px.

================================================================

2026-05-28 — Demo mobile-warning gate (Phase 1 POC)
  New component: DemoMobileGate wraps the app above the router.
    Fires only when isDemoEnabled() AND innerWidth < 1024 AND
    sessionStorage key absent. Soft warning, "Continue anyway" CTA,
    Esc-dismissible, role="alertdialog", aria-labelledby on heading,
    autofocus on button.
  Files added: client/src/components/demo/{DemoMobileGate.jsx,
    computeInitialDismissed.js, DemoMobileGate.test.jsx}
  Files modified: client/src/App.jsx (wrap AuthProvider subtree)
  Brief deviations surfaced:
    - Used isDemoEnabled() helper instead of inlining import.meta.env
      check (matches 9+ existing call sites).
    - Brand subhead "SRA Platform" uses text-text-muted token, not
      LoginPage's legacy hardcoded text-zinc-500. Reconciles "match
      sign-in" with "no zinc hardcodes" — copy lockup structure, route
      token-able text through design system.
    - Extracted computeInitialDismissed as a pure helper for clean
      SSR-branch unit testing (dependency-injected via property-existence
      checks, not destructuring defaults — explicit-undefined matters).
    - aria-labelledby on visible heading id instead of aria-label.
  Tests: 122 client passing (was 106 — +16 new gate tests, plus
    pre-existing suite). Server suite unchanged.
  Decision records updated:
    - docs/decisions/product-decision-log.md → formal structured entry
      "Demo-mode mobile viewport gate" (threshold 1024, sessionStorage,
      check-on-mount).
    - docs/considered-and-deferred.md → "Full mobile responsive build
      for demo" with revisit conditions tied to Field mode M4-M5,
      prospect ask, or observed funnel drop-off.
  Followup deferred:
    - LoginPage.jsx "SRA Platform" subhead still hardcodes text-zinc-500
      (dark-mode gap, separate fix).
    - Update Vantage_Vercel_Deployment_Guide.docx "Before the meeting"
      checklist to mention phone-check + gate (separate Drive doc chunk).
  Next: visual QA at 320/375/414/768/1023/1024 in DevTools + real-device
    smoke after vercel --prod.
  Deploy recovery: bb65bb2 needed a manual vercel --prod and didn't
    auto-promote on the first try. CLI 53.1.0 produced an orphaned
    UNKNOWN-status deploy dpl_3KUqcMCrAF47k6dYfiNRwoTmFSHG (no build
    logs, never aliased — left in place). Upgraded CLI to 54.5.1 (sudo
    npm i -g vercel@latest), re-ran vercel --prod, succeeded. New live
    deploy: dpl_HCDHMK9HaxgJAxMqbnajukSC5AXd. Alias verified pointing
    to new ID; bundle grep on /assets/index-CySC5ygM.js confirms 5/5
    gate string literals present. Parked observation about system-wide
    Node + sudo recorded in docs/considered-and-deferred.md.

================================================================

2026-05-28 — Manual Vercel deploy setup for vorge-demo-roles
  Vercel CLI installed and authenticated (alora-ops account)
  Project linked: alora-ops-projects/vorge-demo-roles
  .vercel/ folder in repo root (gitignored, per-machine config)
  Env var set: VITE_ENABLE_DEMO=true on production scope
  Build settings fixed: Root Directory = client, Framework = Vite
  First successful deploy: db1ac21 main HEAD → vorge-demo-roles.vercel.app
  Deploy ID: dpl_5abKiN4Nn9BGgYDubxvxhkngfgMi
  Pattern established: vercel --prod from repo root deploys current main HEAD to demo URL. No git auto-deploy (intentional — git integration in dashboard remains disconnected).
  Next: mobile-readable warning for demo (Level 1 only)

================================================================

2026-05-28 — Dark mode contrast fix for AssessmentShell active rail item
  Branch merged to main: fix/dark-mode-assessment-rail-contrast
  Fix commit: 911370d
  Merge commit: 8063b2b
  Scope: 3 className edits in AssessmentShell.jsx + 1 deferral entry
    in considered-and-deferred.md
  Trigger: Tailwind opacity-modifier fix (e901317) restored
    dark:bg-primary-900/40 which exposed text-primary resolves to
    same mid-navy in both light/dark modes
  Tests: 106 passing (unchanged). Build clean. CSS bundle +570 bytes.
  Visual QA: confirmed in dark mode at Section 8 view; active rail
    item text readable, number circle digit readable, comment badges
    sitting cleanly
  Captured during QA: section completion state question (when does
    section get green check?) → docs/considered-and-deferred.md
  Followup deferred: red error-count badge (line 74) has same
    structural issue — out of scope this round
  Next: Phase 2 tisolation (new session)

================================================================

2026-05-27 — Dark mode severity ramp locked + tension resolutions
  Branch on origin: feat/dark-mode-spec-refresh
  Commit: <sha after push>
  Tests: 192 server, 102 client, all passing (no behavioral change)
  Lockbox: n/a (CSS tokens + product-decision-log entries)
  Severity ramp:
    - 4 of 5 severity values landed from designer's signed-off spec
      (Low/Med/High/Very High)
    - Critical text overridden from designer's #E23339 to #FF5C61:
      original calculated 4.18:1 on #2B0809 (fails WCAG AA),
      override calculates ~5.5:1 (passes)
    - Designer notified; awaiting confirmation or replacement shade
    - TEMP marker removed; severity tokens now production
  Also in this commit:
    - Secondary mid-tones S-200/300/400 aligned to spec
    - Added --border-primary token (light: primary-200, dark:
      primary-600); refactored 0 consumers (no components use
      --surface-primary today; token is future-facing)
  Tension resolutions (designer notified as FYI, not asking for input):
    - Gold reserved for identity only — logo, sparkle marker,
      selective accent pills. NOT a button color. The amber "CTA
      button" in her preview was template residue from a different
      project.
    - Tertiary teal (T-400 family) reserved exclusively for AI
      affordances. Removed "Success/Progress" label from T-400 usage
      docs. Success uses semantic green (#4ADE80), progress uses sage
      (severity-low). No role overlap.
  Decisions logged: docs/decisions/product-decision-log.md (2 new
    entries for the tension resolutions)
  Smoke: dark-mode pages will be eyeballed before merge
  Next: visual QA in browser, then merge to main

================================================================

2026-05-27 — Merged chunks 0-4 + cleanup + docs into main
  Merge commits: 096c014 (chunks 0-4 + cleanup), 43332e6 (docs)
  origin/main now current with all auth work and decision records
  Branches preserved on origin as historical reference (not deleted)
  All 7 forensic tags on origin: pre-env-gating, pre-auth-logout,
    pre-refresh-tokens, pre-password-reset, pre-cleanup-user-agent,
    pre-mfa-enforcement, pre-production-push
  Vercel: deployment will auto-update if connected (demo mode
    preserved via VITE_ENABLE_DEMO=true env var)
  Next: chunk 5 (TBD) — branch off updated main this time
  
================================================================

# Vorge Build — Session Log

Append entries at the end of every working session. Newest at top.

Entry format:
YYYY-MM-DD — <short label>
  Branch(es)/commit(s) on origin: <list>
  Tests: <server count> server, <client count> client, status
  Lockbox(es): <paths if any>
  Smoke: <result>
  Next: <what's next>
  Deferred: <items pushed to later milestones>

================================================================

2026-05-27 — Decision records and session continuity practice established
  Branch on origin: docs/decision-records-setup
  No code changes; documentation only.
  Files created:
    docs/decisions/HISTORICAL_CONTEXT.md — pointer to pre-chunk-4
      Drive docs at Backup/Business/Security Risk/
    docs/decisions/product-decision-log.md — running product
      decisions, pre-populated with 7 chunk-4 entries
    docs/considered-and-deferred.md — parked items with revisit
      conditions, pre-populated with 13 entries from chunks 1-4
    docs/marketing-positioning-pointer.md — signposts customer-facing
      language decisions back to Drive
    Notes.txt (this file) at repo root
  Next: chunk 5 (TBD — confirm against master plan)
  Note: chunk-4 lockbox at docs/decisions/chunk-4-mfa.md continues
    in place. This setup commit complements it for cross-chunk and
    product records going forward.

================================================================

2026-05-27 — Chunk 4 MFA enforcement shipped
  Branches on origin: cleanup/audit-strip-user-agent (a28c7f0),
    feature/auth-mfa (commits 85a8b71 pre-code artifacts + f1c477c
    MFA implementation)
  Forensic tags pushed: pre-cleanup-user-agent, pre-mfa-enforcement
  Tests: server 192, client 102, all green
  Lockbox: docs/decisions/chunk-4-mfa.md
  UI checklist: docs/decisions/chunk-4-ui-checklist.md
  Smoke: all 5 scenarios passed (verify, /settings/mfa, trust-device
    end-to-end, demo mode clean, rollback flag works and reverts)
  PRs: NOT opened (consistent with chunks 1-3 workflow)
  Followups deferred: per-facility MFA policy editor, configurable
    lockout thresholds, Author/Reviewer MFA reinstatement decision,
    full RLS on MFA tables, Redis migration for rate-limit + replay
    cache (required pre multi-instance), audit_log_entries naming in
    lockbox §NEW-4, seed bug for assessments.contributors JSONB.
  Next: chunk 5 (TBD — confirm against master plan)

================================================================

2026-05-?? — Chunk 3 password reset shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-password-reset (509c939)
  Forensic tag: pre-password-reset (221fd5a)
  Commit subject: "Password reset: forgot/reset flow with stubbed
    email delivery"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 2 refresh tokens shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-refresh-tokens (68a12bc)
  Forensic tag: pre-refresh-tokens
  Commit subject: "Refresh tokens: rotating httpOnly cookie + family
    revocation"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 1 session revocation shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/auth-logout-sessions (221fd5a)
  Forensic tag: pre-auth-logout
  Commit subject: "Server-side session revocation: sessions table,
    sid claim, /logout"
  No lockbox (pre-lockbox pattern)

================================================================

2026-05-?? — Chunk 0 env-gating shipped
  [Reconstructed from git history — incomplete record]
  Branch on origin: feature/env-gating (1d2d632)
  Forensic tag: pre-env-gating
  Commit subject: "Env-gate demo personas; wire real login through
    /api/auth/login"
  No lockbox (pre-lockbox pattern)
