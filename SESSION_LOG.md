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
