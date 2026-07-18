# Guest read-only access — execution plan (binding playbook for build sessions)

**Authored:** 2026-07-18 (Fable session, plan-only) · **Status:** APPROVED PENDING OWNER READ — execute in order
**Governs:** the Guest side-quest line in `docs/roadmap.md` §Suggested improvements
**Binding specs:** `docs/test-specs.md` §Guest read-only access · **Feature:** a self-serve, shared, READ-ONLY guest login on the REAL client (`vorge-app`, `VITE_ENABLE_DEMO=false`) + real API/DB, so a UX designer or security architect can explore alone and cannot persist ANY change. The SERVER enforces read-only — client hiding is presentation, never the guard.

---

## How to use this document (read first, every session)

1. **Start** by reading this file + `docs/test-specs.md` §Guest read-only access. Execute G1 → G6 in order, one block at a time; a block is done only when its named battery is green inside `make test` (integration runs need `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test`).
2. **Every block STOPS before merge/push** (owner rule, 2026-07-16): finish at a local commit + summary; the owner reviews and pushes. Never `git push`, merge, or open a PR as part of completing a block.
3. **Escalation rule (binding):** if implementing requires deviating from anything specified here (guard placement, permission shape, test spec), do NOT improvise. Append the question to **Open questions** at the bottom, leave that thread unfinished, continue other in-scope work.
4. **One review gate:** after G6, STOP for the **F-G Fable gate** (diff review against the tripwires below) before anything touches staging. The staging seed run is a separate confirm-first ceremony (see Runbook) — never run seed against staging/prod Supabase without explicit owner go-ahead in the moment.
5. Work on a focused branch (`feature/guest-readonly` or similar) — this is an auth/security change, which AGENTS.md binds to branch-isolation. No `Co-Authored-By` / AI attribution on any commit.
6. Do NOT edit `docs/businesslogic.md` or `docs/api-contract.md` (owner approval required — the Guest role deliberately stays OUT of canon until the owner promotes it). Do not touch `.env` / `.env.example` without owner review (G2 adds one env var — flag it in the block summary instead of editing `.env.example` yourself).

### Explicitly out of scope / wrong solutions (do not do these)

- **Do NOT use or extend `VITE_ENABLE_DEMO` / the fixture demo** for this feature. The hermetic demo (`vorge-demo-roles`) stays intact; the only demo-adjacent change authorized is the role-enum hygiene named in G4 (keep Guest OUT of the demo role picker).
- **Do NOT fake read-only on the client only.** Every deny is server-enforced first; client work is affordance-hiding + clean error surfacing on top.
- **Do NOT hand out Author/Reviewer/Approver/Admin credentials** as a shortcut. That is the anti-goal.
- **Ignore any `feature/demo-deployment` branch** — different feature, not a base or reference for this work.
- **No migration is needed** — `role_assignments.role` has no DB enum/check constraint (verified); the new role is a code constant + seed row. If you find yourself writing a migration, stop and escalate.

---

## Session order

| # | Block | Gate |
|---|---|---|
| G1 | Server role constant + read permissions (Guest can read, nothing else changes) | — |
| G2 | Seed + fixtures: deterministic guest user & role assignment | — |
| G3 | Server deny hardening: `rejectGuest` on AI endpoints, MFA-enroll block, mechanical mutating-route coverage, full integration deny matrix | — |
| G4 | Client role plumbing: session/nav/home route, GuestDashboard, demo-picker hygiene | — |
| G5 | Client read-only workspace: banner, zero write affordances, clean 403 surface (no false "saved") | — |
| G6 | Full battery + docs sync + hand-off summary | **F-G (Fable) before staging** |

---

## Fact base (verified 2026-07-18 — do not re-derive; line anchors may drift a few lines)

### Server

- **Roles:** `server/src/services/constants.js` → frozen `ROLES` (Author, Reviewer, Approver, HQ Executive, Admin, Mitigation Owner). No DB constraint on `role_assignments.role` — adding a role is a constant + seed row, no migration.
- **Read permission chokepoint:** `server/src/services/permissionService.js` — `canReadAssessment` allowlists [AUTHOR, REVIEWER, APPROVER, HQ_EXECUTIVE, ADMIN] (lines 7–15). A Guest is DENIED all assessment reads until added here. `canAccessAssessmentSections` (line 17) = `!MITIGATION_OWNER && canReadAssessment` — Guest becomes true automatically once readable. `canComment` / `canViewAudit` default false for unknown roles (Guest stays false — decided below). `getAssessmentPermissions` composes all of these into the bundle response.
- **Read routes gate on it:** `GET /api/assessments` filters by `permissions.canRead` (`modules/assessments/routes.js:93-104`); `GET /:assessmentId` 403s when `!permissions.canRead` (routes.js:200-231). List/get scope via `listAssessmentsForUser`/`getAssessmentForUser` → `facilityScopeFor`/`canAccessFacility` (`services/facilityAccessService.js`) which are **role-assignment-driven and role-agnostic**: a Guest with a `role_assignments` row at facility X automatically scopes to X and nothing else. No repo change needed.
- **Content write gate:** `modules/assessments/contentWriteGuard.js` — guard order scope-404 → **Author-only 403 ROLE_NOT_ALLOWED** → Draft-409 → lockVersion-409; referenced 19× in `modules/assessments/routes.js` (assets, threats, links, evaluations, sections, contributors, lead-author, mitigation-owner-assign). **A Guest is already denied on every content write by step 2.** Guest must NEVER be added here.
- **Workflow:** `POST /:assessmentId/workflow` → `transitionAssessment` (`services/assessmentStateMachine.js:86`) — deny order: unknown action 400 → wrong state 409 → **wrong role 403 ROLE_NOT_ALLOWED**. Guest denied for every action (no transition names Guest). Test with an action valid for the current state so the 403 (not the 409) is what's proven.
- **AI endpoints — brief correction (verified):** the five AI routes (`suggest-tags` routes.js:576, `tags/confirm` :674, `generate-draft` :788, `anomaly-check` :1028, `anomaly-acknowledgements` :1142) are mounted with `rejectMitigationOwner` plus an **Author gate inside each handler** (`loadWritableAssessment` or an explicit `req.actingRole !== ROLES.AUTHOR` check in generate-draft). A Guest is therefore already denied — but only **incidentally**, via a gate whose purpose is content-write protection. G3 makes the deny by-construction (shared `rejectGuest` middleware, mirroring the Mitigation Owner matrix) so no future refactor of the Author gate can silently open AI to Guest.
- **Export:** `GET /:assessmentId/export` (routes.js:314) gates on `canAccessAssessmentSections` — once Guest can read sections, Guest can export **unless** G1 splits export into its own helper. Decision below: **block** (new `canExportAssessment`, Guest excluded).
- **Consistency flags:** `GET/PATCH /consistency-flags*` (routes.js:126/140) → inline `requireHqExecutive` → Guest 403 on both (read AND write — accepted; the panel is HQ-only by design).
- **Mitigations:** `GET /api/mitigations/mine` → 403 unless MITIGATION_OWNER; `POST /:mitigationId/log` → `getMitigationForUser` scope + `transitionMitigation` role logic → Guest denied. `PUT /:assessmentId/mitigations/:mitigationId/owner` runs through `runContentMutation` (Author-only).
- **Library:** `modules/library/routes.js` — reads = any facility role via `requireFacilityAccess` (Guest reads WORK automatically, in scope only); writes `authorizeRole(ROLES.ADMIN)` → Guest 403.
- **Admin:** `modules/admin/routes.js` — `router.use(authorizeRole(ROLES.ADMIN))` → Guest 403 on everything.
- **RBAC middleware:** `middleware/authorizeRole.js` — allowlist-based, 403 `ROLE_NOT_ALLOWED`. Guest never appears in any `authorizeRole(...)` call.
- **Auth:** `middleware/authenticate.js` — acting role from the SIGNED token claim `payload.actingRole` (line 56), then `hasAssignedRole(user, actingRole)` else **403 ROLE_NOT_ASSIGNED** (lines 58-65). A forged/edited `actingRole: "Author"` claim in a guest's token is rejected because the guest holds no Author assignment. `POST /api/auth/switch-role` (`modules/auth/routes.js:227`) → 403 `ROLE_NOT_ASSIGNED` for any unassigned target. **No escalation path exists; tests prove it stays that way.**
- **MFA:** `services/mfaPolicy.js` — `MFA_REQUIRED_ROLES = {Approver, HQ Executive, Admin}`; `requiresMfa(user)` is account-wide, strictest-role-wins. A guest holding ONLY the Guest role → no MFA at login (exempt by existing mechanism, zero code). **Hijack vector (must close in G3):** `POST /api/auth/mfa/enroll-start` + `enroll-verify` are open to any authenticated user — a guest could enroll TOTP on the shared account and lock out every other guest. `forgot-password`/`reset-password` are email-token based (emails stubbed until P5) — low risk now, runbook note for P5.
- **Rate limiting:** `middleware/rateLimit.js` — `loginRateLimit` = per-IP 60/min + per-IP+email 10/min. The per-IP+email dimension already contains shared-account brute force per source; no change.
- **Tenant scope/RLS:** `middleware/facilityScope.js` (after `authenticate`) sets the `app.current_facility_ids` GUC via `db/requestScope.js`; RLS `facility_isolation` policies (`migrations/202607030002_rls_policies.js`) default-DENY on unset context; non-owner `vorge_app` role provisioned manually in Supabase. All role-assignment-driven → Guest inherits correct scoping with zero changes.
- **Seed:** `server/src/db/seed.js` — idempotent upsert; users at lines ~192-199 (shared bcrypt hash of `"VorgeDemo123!"`, line ~162), role assignments with stable UUIDs `…-000000001001`–`…-000000001011` (lines ~203-214) across facilities `IDS.bonny` + `IDS.coral` (operator `IDS.northstar`). Integration fixture equivalent: `server/tests/integration/fixtures.js` (2 operators × 2 facilities).
- **Route-coverage tripwire home:** `server/tests/middlewareCoverage.test.js` — introspects `app._router.stack`; `DATA_MODULES = ["/api/assessments", "/api/mitigations", "/api/admin", "/api/library"]`. G3 extends this pattern.

### Client (Vite + React, Vitest + RTL, jsdom, colocated `*.test.jsx`)

- **Roles:** `client/src/auth/session.js` → `ROLES` (same 6), role badge classes (lines ~19-24), demo personas keyed by role (~92-137, six entries — no Guest persona will be added), `isRoleMfaRequired` (~157, Approver/HQ/Admin — untouched), `canDemoSwitchToRole` (~87: in demo, `Object.values(ROLES).includes(role)` — would become true for Guest once the constant exists; G4 excludes Guest explicitly).
- **Auth ctx:** `client/src/auth/AuthContext.jsx` — `useAuth()` → {session, switchRole, switchDemoRole, switchFacility, logout, login}.
- **Route gating:** `client/src/routes/ProtectedRoute.jsx` (`requiredRoles`, MFA redirects); `App.jsx` uses it for MITIGATION_OWNER and ADMIN only; `/dashboard` → `pages/dashboards/DashboardPage.jsx` (dispatches per role to AuthorDashboard/ReviewerDashboard/etc.).
- **Nav:** `client/src/features/navigation/navigation.js` — `NAVIGATION` keyed by role; unknown role → EMPTY nav (Guest needs an entry); `getHomeRouteForRole` special-cases MitOwner/Admin, default `/dashboard`.
- **Read-only helper:** `client/src/features/assessmentWorkspace/assessmentModel.js` → `isAssessmentReadOnly({state, actingRole, serverCanEditContent})` returns true for any non-Author → **Guest auto-resolves read-only**; `getWorkflowActionsForRole` → empty for unknown role; `getCommentPermission` → null default. Call sites: `pages/assessments/AssessmentWorkspacePage.jsx:209`, `layouts/AssessmentShell.jsx:148`. `EvaluationSection.jsx` derives `canEdit = isAuthor && Draft` (safe).
- **prod↔demo seam:** `client/src/auth/demoFlag.js` → `isDemoEnabled()`; all workspace read/write fns branch on it in `features/assessmentWorkspace/WorkspaceContext.jsx` (`saveSectionText` ~919, addAsset/persistAsset/…/exportDocument/generateSectionDraft). Demo = no fetch. Prod reads hydrate via `hydrateAssessmentsList` / `hydrateAssessmentBundle` — server-scoped, so a Guest's dashboard/workspace shows only in-scope rows with zero client filtering work.
- **API layer:** `client/src/api/client.js` — `apiRequest` special-cases ONLY 401-refresh-retry and 409; **a 403 currently throws a generic ApiError → generic error path. G5 closes this** (clean read-only message, no false "saved"). `client/src/api/assessmentApi.js` has the `isConflict`/`CONFLICT_RELOAD_MESSAGE` pattern to mirror for 403.
- **Login:** `client/src/pages/auth/LoginPage.jsx` branches DemoLoginPage vs ProdLoginPage (real `POST /api/auth/login`, MFA branch on `result.mfaRequired`). Guest (no MFA-required role) sails through the non-MFA path — zero login-page changes expected.
- **Test patterns to copy:** fetch-spy write test = `features/assessmentWorkspace/sections/AssetDisaggregationSection.write.test.jsx` (`vi.stubGlobal("fetch",…)`, `callsMatching`, `vi.stubEnv("VITE_ENABLE_DEMO","false")`); role/route RTL = `features/auth/mfa.test.jsx` (`authedSession({role,mfaSatisfied})` factory). **No existing RTL test asserts role→readOnly — Guest specs are net-new coverage.**

---

## Decisions (bound — see Open questions for the reasoning + veto points)

| # | Question | Decision |
|---|---|---|
| D1 | Role name | **`GUEST: "Guest"`** (server `constants.js` + client `session.js`) |
| D2 | MFA | **Exempt** (Guest NOT in `MFA_REQUIRED_ROLES` — existing mechanism, zero code) **+ block Guest MFA self-enrollment** (403 on enroll-start/enroll-verify when acting role is Guest) |
| D3 | Export | **BLOCKED for Guest** — new `canExportAssessment` helper in `permissionService`, export route switches to it; Guest → 403, no audit `export` row |
| D4 | Facility scope | **One facility: `IDS.bonny`** (Bonny Terminal). `IDS.coral` = in-operator negative probe; integration-fixture Op-B = cross-tenant probe |
| D5 | Shared password | `SEED_GUEST_PASSWORD` env var; **unset → guest not seeded + loud console warning** (no guessable default ever lands on staging). Rotation = change env, re-run seed. Existing `loginRateLimit` unchanged |
| D6 | Audit / comments | Guest **cannot** view audit (`canViewAudit` default false — leave untouched) and has **no** comment permission (`canComment` default false — leave untouched). Comments are client-fixture-only today anyway |

---

## Block details

### G1 — Server role constant + read permissions

Smallest possible server surface. After G1 a Guest can READ and still cannot write ANYTHING (every mutating family is already denied by an existing gate — see Fact base; G3 proves it exhaustively).

Files + exact changes:
1. `server/src/services/constants.js` — add `GUEST: "Guest"` to the frozen `ROLES`.
2. `server/src/services/permissionService.js` —
   - `canReadAssessment`: add `ROLES.GUEST` to the allowlist (Guest can read assessments).
   - `canAccessAssessmentSections`: NO change (derives to true for Guest — sections readable).
   - NEW `canExportAssessment({ actingRole })` = `canAccessAssessmentSections({ actingRole }) && actingRole !== ROLES.GUEST` (D3). Export it; add `canExport` to `getAssessmentPermissions`'s returned object so the client learns it from the bundle.
   - `canComment`, `canViewAudit`: NO change (Guest falls to the default-false branches — D6).
3. `server/src/modules/assessments/routes.js` (~line 333, export route) — replace the `canAccessAssessmentSections` check with `canExportAssessment`; same 403 `ROLE_NOT_ALLOWED` shape. This is the ONLY behavior change for existing roles: none — `canExportAssessment` ≡ old check for all six existing roles (assert in tests).
4. `server/src/services/mfaPolicy.js` — NO change (exemption is the absence of Guest; the unit test pins it).

Battery (must be green before ticking): §Guest **G-U1…G-U5** (unit). Run `cd server && npm test` — services coverage threshold (95%) applies to the touched service files.

### G2 — Seed + fixtures: deterministic guest user & role assignment

Files + exact changes:
1. `server/src/db/seed.js` —
   - Read `process.env.SEED_GUEST_PASSWORD`. If unset/empty: `console.warn("[seed] SEED_GUEST_PASSWORD not set — guest user NOT seeded")` and skip the guest entirely (D5). No fallback password, ever.
   - When set: upsert user `id: "00000000-0000-4000-8000-000000000207"` (next free slot in the 20x user block — omar…james are 201–206; the earlier `…107` placeholder was in the facility 10x block and is superseded per G2's "confirm the exact `IDS` pattern in-file and take the next free slot" instruction), `email: "guest@operator-a.example"`, `name: "Vorge Guest"`, own bcrypt hash of `SEED_GUEST_PASSWORD` (existing `env.bcryptRounds`), `mfa_enabled: false`, all MFA columns null/0 (re-running seed therefore RESETS any hostile MFA enrollment — self-healing, note in runbook).
   - Role assignment: stable UUID `"00000000-0000-4000-8000-000000001012"`, role `ROLES.GUEST`, facility `IDS.bonny` ONLY (D4). No coral row.
2. `server/tests/integration/fixtures.js` — add one guest user + Guest role assignment on Op-A/facility-1 (deterministic UUIDs matching the fixture's convention) so every G3 matrix test has a guest to log in as. Do not touch existing fixture rows.

Battery: §Guest **G-S1…G-S3** (integration; requires `TEST_DATABASE_URL`).

### G3 — Server deny hardening + mechanical coverage + full deny matrix

This is the security core. Three parts:

**(a) `rejectGuest` middleware — AI belt-and-braces.**
- New `server/src/middleware/rejectGuest.js`, mirroring `rejectMitigationOwner.js` exactly (403 `ROLE_NOT_ALLOWED`, DomainError, same doc-comment style explaining it makes the Guest×AI deny by-construction rather than incidental on the Author gate).
- Mount it immediately after `rejectMitigationOwner` on all five AI endpoints in `modules/assessments/routes.js`: `suggest-tags`, `tags/confirm`, `generate-draft`, `anomaly-check`, `anomaly-acknowledgements`.

**(b) MFA-enroll block (D2 hijack fix).**
- In `modules/auth/routes.js`, on `mfaRouter.post("/enroll-start")` and `/enroll-verify` handlers: if `req.actingRole === ROLES.GUEST` → 403 `ROLE_NOT_ALLOWED` ("Guest accounts cannot enroll MFA"). Keep it inline (two-line guard) or reuse `rejectGuest` — reuse preferred. `mfa/verify`, `disable`, `regen-recovery-codes` are inert for a never-enrolled account and need no guard (do NOT add speculative guards — escalate if you disagree).

**(c) The mutating-route coverage tripwire (mechanical).**
- New `server/tests/guestDenyCoverage.test.js` (unit, no DB): introspect `app._router.stack` (reuse the walker from `middlewareCoverage.test.js`) and collect EVERY non-GET route under the four `DATA_MODULES` prefixes plus the explicitly-listed auth mutating paths (`/api/auth/switch-role`, `/api/auth/mfa/enroll-start`, `/api/auth/mfa/enroll-verify`). Assert **set equality** with the exported manifest `GUEST_DENY_MANIFEST` (new file `server/tests/guestDenyManifest.js`: `[{ method, path, expectedStatus, expectedCode }]`). A future mutating route that isn't in the manifest FAILS this test — the loud-regression property. Session/auth flow routes a guest legitimately uses (`login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `mfa/verify` family) live in an in-test `AUTH_ALLOWED` list, each with a one-line justification comment (same style as `middlewareCoverage`'s allowlist rules — additions to `AUTH_ALLOWED` require a comment AND owner mention in the block summary).
- New `server/tests/integration/guestWriteDenial.test.js` (integration): iterate `GUEST_DENY_MANIFEST` and fire every entry as the fixture guest **with a VALID payload** (payload map lives beside the manifest — a 400 from Zod proves nothing about role denial; each case must reach the role gate). Assert the expected status/code per family (matrix in §Guest spec) AND, for one representative per content family, that the target row is unchanged in the DB afterward.
- New `server/tests/integration/guestAccess.test.js` (integration): the positive + isolation battery — login, reads, scoping, export block, no-escalation (spec cases G-I1…G-I10).

Battery: §Guest **G-C1…G-C3** + **G-I1…G-I12** + regression **G-R1…G-R4**. Existing suites (`middlewareCoverage`, `tenantIsolation`, `rls*`, unit route tests) must pass UNCHANGED — if one fails, the change is wrong, not the test.

### G4 — Client role plumbing: session, nav, dashboard, demo hygiene

Files + exact changes:
1. `client/src/auth/session.js` — add `GUEST: "Guest"` to `ROLES`; add a badge class for it (pick a neutral tone, e.g. amber/stone, matching the existing Tailwind pattern); `isRoleMfaRequired` UNTOUCHED; `canDemoSwitchToRole` — explicitly exclude `ROLES.GUEST` in the demo branch (Guest has no demo persona; without this, the enum addition would let demo sessions switch into an undefined persona). Do NOT add a Guest entry to the demo personas map.
2. `client/src/features/navigation/navigation.js` — `NAVIGATION[ROLES.GUEST] = [{ label: "Assessments", to: "/dashboard", icon: "home", showInMobileBar: true }]`. One entry only — Guest gets the dashboard and drills into assessments from it (no hardcoded `ACTIVE_ASSESSMENT_ID` deep link: that constant is a fixture id, wrong in prod). `getHomeRouteForRole` needs no change (default `/dashboard`).
3. `client/src/pages/dashboards/GuestDashboard.jsx` — NEW, modeled on `ReviewerDashboard.jsx`'s list structure (read-heavy, no CTAs): renders the hydrated assessments list (prod: `hydrateAssessmentsList` already server-scopes to the guest's facility) with rows linking into the workspace. NO create/submit/queue-action affordances. Register the Guest branch in `DashboardPage.jsx`'s role dispatch.
4. `App.jsx` — no new ProtectedRoute wiring expected (Guest uses the generic authed routes); verify and escalate if a route assumed a role it shouldn't.

Battery: §Guest **G-RTL1…G-RTL3** + demo regression **G-R5**. `cd client && npm test` — auth/features/routes 80% coverage floor stays.

### G5 — Client read-only workspace + clean 403 surface

Server truth already denies; this block makes the guest experience honest.

1. **Read-only banner:** in `layouts/AssessmentShell.jsx` (the `isAssessmentReadOnly` call site, ~148), when `session.actingRole === ROLES.GUEST` render a persistent banner: exact copy `"You're exploring Vorge as a read-only guest — changes aren't saved."` (bind this string; the RTL test asserts it verbatim).
2. **No write affordances:** rely on the existing derivations (`isAssessmentReadOnly` non-Author → true; `getWorkflowActionsForRole` unknown → []; `EvaluationSection` canEdit false; export button — hide when bundle `permissions.canExport === false`, which G1 now supplies). Audit each workspace section for stray enabled inputs/buttons under Guest; fix by consuming the EXISTING readOnly derivation, never by adding `role !== GUEST` sprinkles (one role check in the banner is the only new role conditional allowed in workspace code).
3. **Clean 403 (no false "saved"):** in `client/src/api/assessmentApi.js` add `isForbidden(error)` + `READ_ONLY_MESSAGE = "Your role can't make changes here — nothing was saved."` mirroring the `isConflict`/`CONFLICT_RELOAD_MESSAGE` pattern. In `WorkspaceContext.jsx`, every catch path that today special-cases 409 gains a 403 branch: surface `READ_ONLY_MESSAGE` via the same banner/toast channel the 409 uses and revert/reload the optimistic local state the same way the 409 path does. Do not touch `client.js`'s 401/refresh machinery.

Battery: §Guest **G-RTL4…G-RTL7**.

### G6 — Full battery + docs sync + hand-off  → GATE F-G

- Run the FULL suite: `make test` with `TEST_DATABASE_URL` set (unit + client + integration all green; record counts).
- Docs per house rules: append `SESSION_LOG.md`; update the roadmap side-quest line status; `docs/production-status.md` only if its status table gains a row for this (likely not — side-quest). Do NOT tick anything whose battery isn't green. Do NOT edit `businesslogic.md`/`api-contract.md`.
- Block summary for the owner must list: env var added (`SEED_GUEST_PASSWORD` — `.env.example` change proposed, not made), the staging seed ceremony (below), and any Open-questions threads.
- **STOP — request the F-G Fable gate** (checklist below). After F-G passes and the owner pushes, the owner (not the agent) runs the staging seed per the Runbook.

---

## Tripwires (F-G checks these mechanically where possible)

1. **middlewareCoverage / guestDenyCoverage:** no unguarded mutating route — `guestDenyCoverage.test.js` set-equality means every non-GET data route (incl. all five AI endpoints) has a Guest-deny integration case. `rg -n "rejectGuest" server/src/modules/assessments/routes.js` → exactly 5 mounts.
2. **Guest never in a write allowlist:** `rg -n "GUEST" server/src/modules/assessments/contentWriteGuard.js server/src/middleware/authorizeRole.js` → zero hits; `rg -n "ROLES.GUEST" server/src` hits ONLY `constants.js`, `permissionService.js` (read/export helpers), `rejectGuest.js`, auth MFA-enroll guard, `seed.js`. Anything else = escalate.
3. **No privilege escalation:** `switch-role` to Author → 403 `ROLE_NOT_ASSIGNED` (G-I8); forged token `actingRole: "Author"` → 403 `ROLE_NOT_ASSIGNED` at `authenticate` (G-I9). No code change may weaken `hasAssignedRole`.
4. **No cross-tenant/facility read:** G-I5/G-I6 (coral 404, Op-B 404, list contains only bonny ids). Existing `tenantIsolation`/`rls` suites pass UNCHANGED.
5. **Fixture demo untouched** except the authorized hygiene: `canDemoSwitchToRole` excludes GUEST; no Guest demo persona; DemoLoginPage renders the same six roles (G-R5). `git diff --stat` shows no other demo-file churn.
6. **Existing-role behavior frozen:** Author still writes (G-R1), export still works for the five section-access roles (G-R3), Mitigation Owner matrix unchanged (G-R2). Existing test counts are floors.

---

## Security threat notes

- **Shared password:** one credential, many hands → non-attributable audit rows (all actions log the guest user id). Accepted for a read-only, single-facility, seed-data-only account; contained by D3 (no export/bulk exfil), D6 (no audit read), rotation runbook. Never reuse the demo `VorgeDemo123!` pattern; `SEED_GUEST_PASSWORD` must be a generated passphrase from the owner's password manager.
- **Login rate limiting:** per-IP+email 10/min already bounds guessing per source; per-IP 60/min bounds spray. A hostile party knowing the guest email cannot lock out a designer on a different IP (no account-level lockout on password auth). No change.
- **MFA self-serve:** exemption (D2) keeps self-serve; the enroll-block closes the shared-account MFA-hijack (one guest enrolling TOTP would lock out all others). Re-running seed resets MFA columns — self-healing backstop.
- **Password-reset takeover:** reset emails are stubbed until P5, so `forgot-password` on the guest email is inert today. **P5 note (runbook):** when email ships, the guest mailbox (`guest@operator-a.example` or its staging-domain successor) must be owner-controlled or reset must be blocked for Guest — revisit at P5.
- **IDOR / cross-tenant:** scoping is role-assignment-driven (`facilityScopeFor`) + RLS default-deny; Guest gets one bonny assignment, so by-id probes at coral/Op-B → 404 (no existence leak). Proven in G-I5/G-I6.
- **Privilege escalation:** acting role is a signed claim + `hasAssignedRole` re-check on every request; switch-role requires an assignment. Guest holds exactly one role. G-I8/G-I9.
- **AI endpoints:** double-gated after G3 (`rejectGuest` + Author gates); also spend-safe — a guest can never trigger a gateway call, so no budget/rate-limiter surface.
- **Admin/library writes:** `authorizeRole(ADMIN)` allowlists — Guest 403 by construction; covered in the manifest anyway.

---

## Runbook — staging guest (credentials live OUTSIDE git)

1. **Create/refresh:** owner sets `SEED_GUEST_PASSWORD` in the Render (server) environment — value generated in and stored ONLY in the owner's password manager (1Password entry "Vorge staging guest"). Then run the seed against staging (existing ceremony: `npm run seed` with staging `DATABASE_URL`, owner-confirmed in the moment — agents never run this). Seed is idempotent; re-runs update the hash + reset MFA columns.
2. **Hand-out:** share `guest@operator-a.example` + the current passphrase through the owner's normal secret channel (password-manager share link — never email/Slack plaintext, never a doc in this repo).
3. **Rotate** (after each evaluation round, or on suspicion): change `SEED_GUEST_PASSWORD`, re-run seed, update the password-manager entry. Active guest sessions die at refresh-token expiry; for immediate kill, also delete the guest's rows in `sessions` (SQL snippet in the owner's staging notes).
4. **Revoke entirely:** unset `SEED_GUEST_PASSWORD` and delete the guest `users` + `role_assignments` + `sessions` rows (ids are deterministic: user `…-000000000207`, assignment `…-000000001012`).
5. **Never:** commit the passphrase, put it in `.env.example`, or seed the guest into any production tenant DB.

---

## Definition of Done

`docs/test-specs.md` **§Guest read-only access** is the DoD — every case there exists, runs inside `make test` (integration via `TEST_DATABASE_URL`), and passes. No G-block is ticked until its named battery is green; the feature is not done until F-G passes and the owner has run the staging runbook and confirmed a live guest login end-to-end (real client, `VITE_ENABLE_DEMO=false`).

---

## Open questions (decided-with-default unless marked STOP; owner may veto any at F-G)

None are STOP-blocking — every default below is a one-file reversal and the build order doesn't fork on any of them.

1. **Role name — GUEST (Recommended).** "Guest" signals a limited-trust, shared evaluation account and keeps "Viewer" free for a possible future customer-facing read-only product role (which would deserve canon treatment in `businesslogic.md`). Alternative: VIEWER — reads more product-like, but risks colliding with that future role and overstating permanence.
2. **MFA — exemption + enroll-block (Recommended).** Zero-code exemption via the existing `MFA_REQUIRED_ROLES` mechanism, matching Author/Reviewer posture; blocking self-enrollment closes the shared-account hijack. Alternative: pre-enrolled TOTP device — stronger auth but distributing a shared TOTP secret is its own leak and kills self-serve.
3. **Export — BLOCK (Recommended).** Export is the one GET that packages an entire assessment into a portable document; on a non-attributable shared credential that's a bulk-exfil affordance the evaluation use-case doesn't need, and blocking keeps the "guest produces nothing" story pure. Alternative: allow (it is audited + watermarked and shows off P3.5) — flip = invert `canExportAssessment` for Guest + swap spec case G-I7 to a 200-with-audit-row assertion.
4. **Facility scope — bonny only (Recommended).** Single-facility scope makes every isolation assertion crisp (coral = in-operator probe, Op-B = cross-tenant probe) and bonny's In-Review assessment is the richest seeded content. Alternative: bonny+coral — more to explore, weaker negative-space in tests.
5. **Shared-password strategy — env-var seed, skip-if-unset, rotate-by-reseed (Recommended).** No secret in git, no guessable default can reach staging, rotation is one env change. Alternative: hand-SQL a bespoke user per evaluator — attributable but kills self-serve and adds per-guest ceremony.
6. **Audit/comments read — deny both (Recommended).** Audit rows expose real user activity metadata the evaluation doesn't need; comments have no server surface yet so there is nothing to grant. Alternative: allow summary audit — more product visible, more metadata exposed.

*(Build sessions append new questions below this line; resolved in the F-G Fable session.)*
