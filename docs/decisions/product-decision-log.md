# Product Decision Log

Running record of significant product, feature, and architecture
decisions across the Vorge platform. Append-only — when a decision
is later revised, add a new entry referencing the old one rather than
editing in place.

For chunk-specific technical decisions (the kind with locked answers,
deviations from spec, and pen-test implications), see the per-chunk
lockboxes at `docs/decisions/chunk-<n>-<name>.md`.

This log captures:
- Cross-chunk product decisions
- Feature-scope decisions (what's in, what's out, why)
- Customer-facing behavior decisions
- Trade-offs accepted between scope, security, velocity, UX

---

## Entry format

```
## <Decision name>
Date: YYYY-MM-DD
Decided by: <name>
Status: locked | revisited | superseded by <link>

### Context
What problem or question prompted the decision.

### Options considered
- A: ...
- B: ...
- C: ...

### Decision
The chosen option.

### Rationale
Why.

### Revisit conditions
What would make us reopen this.

### Related artifacts
- Lockbox: docs/decisions/chunk-X-name.md (if applicable)
- Commit: <sha> (if applicable)
- Drive doc: <name> (if applicable)
```

---

## Decisions

## MFA factor selection: TOTP only at launch
Date: 2026-05-26
Decided by: Solo
Status: locked

### Context
Chunk 4 needed a multi-factor authentication primary factor. The
Dev_Team_MSA.docx Section 8.3.1 mandates TOTP (RFC 6238) and forbids
SMS. The question was whether to ship TOTP only or also WebAuthn
(hardware keys, biometrics) at launch.

### Options considered
- A: TOTP only
- B: TOTP + WebAuthn
- C: WebAuthn only

### Decision
A — TOTP only at launch.

### Rationale
Universal authenticator app support (Google Authenticator, Authy,
1Password, etc.). Familiar UX to all users. Halves chunk-4 surface
area. WebAuthn is a discrete enhancement to add later when customer
demand surfaces.

### Revisit conditions
- Customer in regulated sector (defense, finance) requires hardware
  token support
- WebAuthn becomes a procurement checkbox item for a target buyer
- Pen test recommends WebAuthn for high-privilege roles

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (locked decision #1)

---

## MFA enforcement scope: per-role hardcoded vs per-facility configurable
Date: 2026-05-26
Decided by: Solo
Status: locked for chunk 4; deferred to M4-proper for full config

### Context
Spec (Vantage_User_Flows.docx Workflow 17) calls for Admin policy
editor allowing per-facility MFA configuration with three options per
role: Required for all sessions / Required for new devices only /
Disabled. Chunk 4 needed to ship working MFA enforcement without
building the full admin policy editor.

### Options considered
- A: Per-role hardcoded (Approver, HQ Executive, Admin require MFA;
     others don't), Boolean only
- B: Per-facility configurable Boolean
- C: Full three-option per-role per-facility model as spec'd

### Decision
A for chunk 4. B and C deferred to M4-proper alongside the Admin
policy editor build.

### Rationale
POC velocity. Hardcoded captures 80% of risk. Tightening to "everyone"
later is a config change. Building the editor in chunk 4 alongside MFA
enforcement would have doubled the surface area.

### Revisit conditions
M4-proper milestone. Per-facility config and three-option model both
deferred there.

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (deviations #1 and #2)
- Spec: Vantage_User_Flows.docx Workflow 17

---

## Author and Reviewer MFA posture: downgrade from spec defaults
Date: 2026-05-26
Decided by: Solo
Status: locked for chunk 4; flagged for end-client review

### Context
Spec defaults have Author and Reviewer roles at
"MFA-required-for-new-devices." Chunk 4 ships them at no-MFA.

### Options considered
- A: Match spec defaults (Author/Reviewer require MFA on new devices)
- B: Downgrade Author/Reviewer to no-MFA for POC velocity, flag for
     end-client review
- C: Upgrade Author/Reviewer to required-all-sessions

### Decision
B for chunk 4.

### Rationale
POC velocity. The new-devices-only semantics require the trust-device
cookie infrastructure to work end-to-end across roles, which adds
testing surface. For POC, simpler model demonstrates the security
posture without the per-role variability. **Flagged as security
posture regression** in chunk-4 lockbox §Deviations #3.

### Revisit conditions
End-client review before pen test. If end-client wants the spec
default posture restored, this happens in M4-proper alongside the
policy editor.

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (deviation #3)

---

## Trust-this-browser cookie semantics
Date: 2026-05-26
Decided by: Solo
Status: locked

### Context
Once MFA is verified at login, the user can opt to mark the current
browser as "trusted" so subsequent logins skip the MFA challenge. The
question was duration, default state, and storage mechanism.

### Options considered
- A: Never offered
- B: Opt-in, off by default, 30-day cookie
- C: Always offered, on by default
- D: Duration varies by role

### Decision
B.

### Rationale
Matches SaaS standard (GitHub, Slack, Linear). Default-off avoids
carelessness on shared devices. 30 days is the broadly accepted
balance between friction and security. Same cookie infrastructure as
chunk-2 refresh tokens.

### Revisit conditions
- Customer/auditor requests shorter window
- Step-up MFA introduced (would supersede this for sensitive actions)

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (locked decision #4)

---

## Lockout policy: geometric backoff vs flat window
Date: 2026-05-26
Decided by: Solo (revision of initial recommendation)
Status: locked

### Context
After N failed MFA verification attempts, what happens? Original
recommendation was flat 5-fails → 15-min lock. Reviewer caught that
the Dev_Team_MSA.docx 8.3.1 mandates "exponential backoff" for account
lockout.

### Options considered
- A: Flat lockout (5 fails → 15 min)
- B: Geometric backoff (3 → 30s, 5 → 5min, 7 → 30min, 10 → 24h
     requires admin reset)
- C: Tunable per-tenant

### Decision
B.

### Rationale
Contractually compliant with MSA 8.3.1. Better UX (typos cost 30s, not
15min). Strict enough to make brute force infeasible. Per-tenant
tunability deferred to M4-proper as part of the policy editor.

### Revisit conditions
- Pen test recommends different progression
- Customer requests per-facility tunable thresholds (already on
  M4-proper backlog)

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (locked decision #9,
  deviation #4)

---

## Audit metadata: user_agent removal
Date: 2026-05-26
Decided by: Solo
Status: locked (chunks 1-3 cleanup landed alongside chunk 4)

### Context
Chunks 1-3 audit events included `user_agent` in the metadata.
Reviewer flagged this against MSA 8.3.8 which forbids "full PII" in
audit logs. Decision needed on whether to clean up chunks 1-3 or
exempt MFA only.

### Options considered
- A: Strict MSA reading — strip user_agent from chunks 1-3, apply new
     rule from chunk 4 forward
- B: MFA-specific stricter rule — keep user_agent in chunks 1-3, MFA
     events alone exclude it

### Decision
A.

### Rationale
One consistent rule. Same-codebase inconsistency between auth event
types would be worse for pen-test optics and future maintenance.
Forensic `user_agent` columns on `sessions` and
`password_reset_tokens` rows retained — those are resource-row
metadata, not audit log metadata.

### Revisit conditions
If user_agent-equivalent signal needed for anomaly detection in the
future: hash it or reduce to family ("Chrome/macOS") rather than
restoring the raw value.

### Related artifacts
- Lockbox: docs/decisions/chunk-4-mfa.md (deviation #5)
- Commit: a28c7f0 (cleanup PR)

---

## UX: Disable MFA card visibility for MFA-required-role users
Date: 2026-05-27
Decided by: Solo (during chunk 4 implementation)
Status: locked

### Context
The chunk-4 UI checklist (row 4) specified that the "Disable MFA"
card on `/settings/mfa` should be hidden entirely for users in
MFA-required roles. During implementation, the alternative — show the
card with explanatory copy — emerged as a UX improvement.

### Options considered
- A: Hide the Disable MFA card entirely (as checklist specified)
- B: Show the card with explanatory copy: "MFA is required for your
     role and cannot be disabled. Contact an admin to change role
     assignments."

### Decision
B.

### Rationale
Visible-with-explanation is clearer UX than silent absence. Users who
go looking for the feature find an answer ("you can't, here's why")
rather than wondering if the feature exists. Destructive action
remains server-side blocked regardless of UI state. Verified during
smoke test.

### Revisit conditions
- Customer/auditor specifically requests hidden state
- Inconsistency with other forbidden-action UX elsewhere in the
  platform

### Related artifacts
- Lockbox: docs/decisions/chunk-4-ui-checklist.md (deviation noted in
  commit message of f1c477c)
- Commit: f1c477c

---

## Brand color: gold reserved for identity, not buttons
Date: 2026-05-27
Decided by: Solo
Status: locked

### Context
Designer's dark-mode preview HTML included an amber-on-dark "CTA
button" sample. Identified during dark-mode-spec review as template
residue from a different project — gold is Vorge's identity color
(logo, sparkle marker, selective accent pills), not an action color.

### Options considered
- A: Adopt gold as CTA button color per designer's preview HTML
- B: Reserve gold for identity uses only; CTAs use the primary navy

### Decision
B.

### Rationale
Gold is the Vorge identity mark. Repurposing it as a primary CTA
dilutes the visual hierarchy and makes the brand harder to read at a
glance. Buttons stay on the primary navy ramp; gold appears in logo,
sparkle marker, and selective accent pills only.

### Revisit conditions
- Designer formally proposes a gold action treatment with specific
  contrast + hover/active states
- A specific surface (e.g. paid-tier upgrade prompt) needs a visually
  distinct action affordance and gold is the best fit

### Related artifacts
- Designer preview HTML (in HISTORICAL_CONTEXT.md drive backup)
- Marketing pointer: docs/marketing-positioning-pointer.md

---

## Brand color: tertiary teal reserved for AI affordances only
Date: 2026-05-27
Decided by: Solo
Status: locked

### Context
Designer's "Token usage roles" labeled tertiary teal (T-400 family)
as both "Success/Progress" and AI accent. Identified during dark-mode
review as a role overlap. Teal is Vorge's AI affordance color (per
chunk-0 dark mode sweep, commit 9d8d372). Success and progress have
semantic-green and severity-low coverage already.

### Options considered
- A: Allow teal to cover both AI affordances and success/progress
- B: Reserve teal exclusively for AI affordances; success uses semantic
     green (#4ADE80), progress uses sage (severity-low)

### Decision
B.

### Rationale
Teal is a strong visual signal in the Vorge palette. Reserving it
for AI lets users build a reliable "this is AI" reading at a glance,
unconfused by success or progress states. Semantic green and sage are
already established for success and progress respectively.

### Revisit conditions
- AI features land that explicitly need a non-teal accent
- A success surface specifically requires the teal hue for parity with
  another product surface

### Related artifacts
- chunk-0 commit 9d8d372 (initial AI accent treatment)
- Designer preview HTML (token usage section)

---

## 2026-05-27: Fixed silently-dropped dark: opacity-modifier Tailwind utilities

Issue: ~15 component sites using bg-primary-50 dark:bg-primary-900/N pattern
appeared broken in dark mode. Root cause: Tailwind 3.x cannot decompose
hex-format CSS variables for the opacity-modifier syntax (color/N), so it
silently drops the utilities at build time. The dark: variants never
existed in the bundle. Light-mode utilities worked because they don't need
decomposition.

Diagnosis: confirmed via build-CSS grep showing zero dark:bg-*/N utilities,
plus DOM inspect showing rgb(220, 230, 240) (light) on a row that had
class="bg-primary-50 dark:bg-primary-900/80" in dark mode.

Fix: Strategy 1 (hybrid). Added 44 parallel *-rgb channel-triple variables
alongside existing hex ramps. Pointed Tailwind at the -rgb variants via
rgb(var(...) / <alpha-value>) syntax. Existing hex variables and all role
tokens left intact — zero component changes required. Added drift assertion
test to catch hex↔rgb mismatch.

Blast: zero outside Tailwind layer. Audit confirmed 100% of ramp consumers
go through Tailwind utilities; only one direct property usage exists in
index.css and consumes a hex-format variable that stays valid.

Effect: every dark:bg-*-N/N (and equivalent) consumer now works correctly.
Resolves the selected-evaluation-row contrast issue and other latent
sites surfaced during audit.

### Coordination note
The `feat/dark-mode-spec-refresh` branch (severity ramp + Secondary
mid-tone alignment + `--border-primary`) is pending merge. Its Secondary
mid-tone updates (S-200/300/400) will need matching `-rgb` channel updates
when it lands, or the drift test will fail. Resolve at merge time.

## Demo-mode mobile viewport gate
Date: 2026-05-28
Decided by: Solo
Status: locked

### Context
The Phase 1 demo is now deployed to `vorge-demo-roles.vercel.app` (env
flag `VITE_ENABLE_DEMO=true`). Prospects routinely open demo links on
phones. The Vorge platform is desk-only by design — topbar, role
switcher, dashboard tables, and assessment shell all assume tablet/desktop
viewports. We need to set expectations without blocking; first-impression
quality at a small viewport is worse than a one-tap pre-roll explaining
this.

### Options considered
- A: Do nothing. Let prospects see the broken layout and self-select away.
- B: Hard-block mobile (no Continue). Treat phones as unsupported.
- C: Soft warning gate with a "Continue anyway" CTA. Demo-mode only.
- D: Full responsive build for the demo. Make every screen mobile-ready.

Sub-decisions inside Option C:
- Viewport threshold: 1024 (Tailwind `lg:`) vs 768 (Tailwind `md:`) vs
  custom narrow band.
- Persistence: `sessionStorage` (re-fires on new browser session) vs
  `localStorage` (one-time forever).
- Check timing: on-mount only vs reactive `resize` listener.

### Decision
Option C: soft warning gate, demo-mode only, gated by:
`isDemoEnabled() === true` AND `window.innerWidth < 1024` AND
sessionStorage key absent.

Threshold = 1024 (Tailwind `lg:`).
Persistence = `sessionStorage`, key `vorge:demo:mobile-gate-dismissed`.
Check on mount only — no resize listener.

Option D is recorded in `docs/considered-and-deferred.md` and is not in
scope for Phase 1.

### Rationale
- 1024 matches the same breakpoint the layout already uses (`lg:`); the
  layout is genuinely fine at iPad Pro portrait (1024 wide) and breaks
  predictably below it.
- `sessionStorage`, not `localStorage`: a prospect who opens the demo a
  week later in a new session benefits from the reminder again. They may
  not remember they accepted the warning. Cost of re-showing is one tap.
- Check on mount only: if a user resizes mid-session, neither re-firing
  nor re-hiding is what they want. Resize events on touch devices are
  also noisy (rotation, browser chrome animation) — a stable
  one-shot-on-load is the simpler contract.
- Soft, not hard: the goal is expectation-setting, not gating. A prospect
  showing the platform to a colleague on a phone should be able to.

Sub-rationale (token usage): the brand lockup mirrors `LoginPage.jsx` for
visual parity, but the "SRA Platform" subhead routes through the
`text-text-muted` design-system token instead of `LoginPage`'s legacy
hardcoded `text-zinc-500`. `LoginPage`'s zinc-500 is a small dark-mode
gap that should be revisited separately; the new gate uses the
token-aware version from day one rather than copying the legacy class.

### Revisit conditions
- Field mode (M4–M5) ships responsive mobile views — at that point we
  may have real mobile screens worth not blocking.
- Explicit prospect request for mobile-usable demo.
- Observed funnel drop-off attributable to the warning (rather than to
  general mobile unsuitability).
- Tailwind breakpoint changes downstream.

### Related artifacts
- Implementation: `client/src/components/demo/DemoMobileGate.jsx`,
  `client/src/components/demo/computeInitialDismissed.js`,
  `client/src/components/demo/DemoMobileGate.test.jsx`,
  wired in `client/src/App.jsx`.
- Considered-and-deferred entry: "Full mobile responsive build for demo"
  in `docs/considered-and-deferred.md`.

## Author dashboard — whole-row tap target + per-mode landing section
Date: 2026-05-28
Decided by: Solo
Status: locked

### Context
Phone-based QA of the live demo (deploy `dpl_HCDHMK9HaxgJAxMqbnajukSC5AXd`) surfaced that the "Lagos Refinery — 2026 SRA" row on the Author dashboard responded fine to mouse clicks on desktop but ignored finger taps on phone. Other touch interactions on the phone worked (demo bypass, sign-in, "New Assessment" button) — so the issue was row-specific, not a global touch failure.

Inspection of `AuthorDashboard.jsx:230-272` revealed: the `<tr>` itself had no `onClick` at all. The only interactive element was a small text-link button in the rightmost column (`text-[13px] font-medium hover:underline`, no padding, no min-height) with effective hit-box ≈ 13-18px × 60-80px. iOS minimum recommended touch target is 44×44px. Mouse precision-clicks landed reliably; finger taps missed. The user's intuition ("the row is clickable on desktop") was sound UX even though it didn't match implementation.

Separately, with row interactivity becoming a primary affordance, the landing-section question gets surfaced: where should the assessment shell open when an Author taps a row? Today the code navigates to section 2 (Facility Info) regardless of audience.

### Options considered
1. Just enlarge the existing button (padding/min-height) to a real 44px touch target. Row stays non-interactive.
2. Make the whole `<tr>` clickable with `role="button"`, `tabIndex={0}`, Enter/Space keyboard handlers, `aria-label` per assessment. Keep the existing inner button as an explicit visual affordance, with `stopPropagation` to avoid double-fire.
3. Land both demo and production on section 1 (Executive Summary) for everyone — more "natural reading order."
4. Land both demo and production on section 2 (Facility Info) — preserve current production behaviour everywhere.
5. Branch the landing section by demo flag: section 1 in demo, section 2 in production.

### Decision
- Touch target: option 2. Whole-row clickable.
- Landing section: option 5. Demo → section 1, production → section 2. Branch via `isDemoEnabled()` in a per-row `landingSection` constant inside the row map.

### Rationale
- Whole-row is the user's natural mental model and the larger touch target by default. Removes the need to per-button-size every dashboard. Keeps the inner button as a visible affordance for users who scan for the action label and arrow.
- Demo and production have different audiences. Production Authors resume where their work data lives — Facility Info is where most edits happen. Prospects entering cold during a demo benefit from natural reading order — Executive Summary frames everything that follows.
- Branching is purely additive: production behaviour is preserved exactly (still section 2). The only change is what demo viewers land on.
- A11y: `role="button"` on `<tr>` is non-standard but with explicit `aria-label`, `tabIndex={0}`, and keyboard handlers, screen readers announce the row as an action correctly. The inner button stops propagation so a button click doesn't fire twice.

### Revisit conditions
- A new dashboard pattern (e.g. multi-select via row checkbox) needs row clicks for something other than navigate.
- Authors report wanting to land on whichever section they last viewed (rather than hardcoded section 2). See open question below.
- Real-auth API ships and dashboard data changes shape in a way that affects routing decisions.

### Open question (not for this chunk)
Should production Authors resume at last-viewed section instead of hardcoded section 2? Today every assessment opens at section 2 regardless of progress. Worth revisiting once we have clearer signal on how Authors actually move between sections — likely needs a `lastViewedSectionId` field on the assessment record plus a small change in the navigate helper.

### Follow-up (deferred)
Reviewer, Approver, HQ Executive, and Mitigation Owner dashboards may have the same small-target pattern. Out of scope per the chunk constraint; flag for the next chunk so we don't ship a phone-friendly Author dashboard while everyone else stays broken.

### Related artifacts
- Implementation: `client/src/pages/dashboards/AuthorDashboard.jsx` (row + button + helper).
- Tests: `client/src/pages/dashboards/AuthorDashboard.test.jsx` (6 new cases covering both demo modes + keyboard + a11y).
- SESSION_LOG entry: 2026-05-28.

## 2026-05-28: Section 6 validation messages use human labels
Phone-based QA of the live demo surfaced that Section 6 (Vulnerability
Assessment & Risk Treatment) was leaking raw evaluation database IDs in
the validation banner. Example seen on-device:

> Evaluation `e-at-t5-1779934620202` is missing the risk scenario.
> Evaluation `e-at-t5-1779934620202` has no R1 score.

The reader had no way to map `e-at-t5-1779934620202` back to a matrix
cell without decoding the ID structure. Section 6 was the only section
with this bug — Section 3 (assets), Section 4 (threats), and Section 7
(mitigations) all already used human-readable labels in their messages.
In particular, `sectionValidation.js` already had a `mitigationLabel()`
helper that resolves an evaluation's `(assetId, threatId)` to
`the {Asset name} × {Threat name} mitigation`. Section 7's messages had
been routing through it; Section 6's eval messages had not.

Fix: added an `evaluationLabel()` helper next to `mitigationLabel()`,
mirroring the same fallback chain (asset `name` → asset id; threat
`short` → `classification` → `name` → threat id; final fallback "an
evaluation" rather than leak the eval id). Rewrote the two eval messages
to use the sentence-cased label. Codes (`eval-scenario`, `eval-r1`) are
unchanged so programmatic consumers (and existing code-based test
assertions) still work.

New user-visible messages:
> The Asset 1 × Terrorism evaluation is missing the risk scenario.
> The Asset 1 × Terrorism evaluation has no R1 score.

Tests: added two new assertions in `client.test.jsx`. One locks the
asset/threat name presence and absence of the raw eval id (regression
lock). One verifies graceful fallback when asset/threat lookups fail.
130 client tests passing (was 128).

### Open question / deferred
Deep-linking the error to the offending matrix cell — click the
banner row → scroll to and focus the Asset N × Threat cell. Today
`ValidationSummary.jsx` only receives message strings; supporting click
navigation would mean threading richer error objects (with `assetId`,
`threatId`) through the validator AND refactoring the banner to render
JSX rows instead of strings. Worth doing next; not in this chunk.

## 2026-05-29: LoginPage dark-mode brand contrast + real logo
Date: 2026-05-29
Decided by: Solo
Status: locked

### Context
In dark mode the LoginPage brand elements blended into the dark navy
page: the "Vorge" wordmark, "Sign in to continue" heading, and the
primary "Sign in" button all rendered in brand navy (primary-500) on a
near-navy background. Low contrast, weak brand presence, unclear primary
action.

Separately, the brand lockup used a placeholder Lucide shield, not the
real logo.

### Options considered (brand contrast)
- A: Lighter navy across the board (wordmark + heading + button all
  lighter navy). Keeps monochrome but the CTA stops reading as the
  primary action.
- B: White brand everything. High contrast but loses brand colour and
  the CTA still competes with text.
- C: Elevated card behind the form. Adds structure but doesn't fix the
  navy-on-navy colour problem.
- **3 (chosen): Gold CTA + lighter-navy heading.** Sign-in button →
  brand-amber background with dark-navy text (becomes the obvious
  primary action and ties to the logo's amber mark); heading → lighter
  navy (primary-300 #7B99B3); wordmark handled by the logo asset (see
  below). Light mode unchanged.

### Options considered (logo)
The task assumed only a white-background JPEG existed and proposed
processing it (crop mark, strip white, render wordmark as text).
**Exploration found this unnecessary**: the repo already contains
designer-made, theme-correct SVG lockups in `client/src/assets/` —
`vorge-logo-on-light.svg` (wordmark as black paths) and
`vorge-logo-on-dark.svg` (wordmark as white paths). Both vector,
transparent, full mark+wordmark, added 2026-05-12 but never wired into
LoginPage. The provided PNG is superseded.

### Decision
- Wire the existing SVGs by theme: `on-light` shown in light
  (`block dark:hidden`), `on-dark` in dark (`hidden dark:block`). No
  image processing. The lockup `<img>` replaces both the Lucide shield
  AND the separate "Vorge" text; "SRA Platform" stays as token text.
- Dark wordmark stays **white** (the designer's on-dark asset as-is),
  not recoloured to lighter navy. Max contrast, uses the real brand
  asset, zero vector editing. Heading still goes lighter-navy per
  Option 3 — white logo wordmark + lighter-navy heading + gold CTA is a
  clean hierarchy.
- CTA gold = **brand-mark amber #F49D0D** (matches the logo square) over
  semantic-warning #F59E0B or a lighter amber-400. Applied as a LOCAL
  dark utility (`dark:bg-[#F49D0D] dark:text-primary-900
  dark:hover:bg-[#FFB020] dark:border-transparent`) — deliberately NOT a
  token, to keep the gold-CTA scoped to LoginPage. A global token change
  would leak gold to every primary button app-wide.
- Lockup size: `h-8` (32px) — bigger presence than the 28px placeholder,
  balanced against the "SRA Platform" subhead. Horizontal lockup (matches
  the asset's native orientation).
- No new design tokens. Uses Tailwind `dark:` utilities + the existing
  primary ramp (primary-300) and a local hex for the brand gold.

### Applies to
Both LoginPage variants (DemoLoginPage + ProdLoginPage) — identical
lockup, heading, and button treatment.

### Open question / deferred
The gold-CTA-in-dark-mode pattern should extend to other primary CTAs
(dashboards, workspace, admin) for consistency, and the local #F49D0D
utility should then be promoted to a proper action token. Deferred to a
designer-reviewed CTA-token chunk so we don't leak gold piecemeal.

### Related artifacts
- `client/src/pages/auth/LoginPage.jsx` (both variants).
- `client/src/assets/vorge-logo-on-{light,dark}.svg` (existing, now wired).
- SESSION_LOG 2026-05-29.

## AD-1: Anomaly acknowledgement on Section 3 assets
Date: 2026-05-29
Decided by: Solo
Status: locked

### Context
`docs/businesslogic.md` §9.2 specs real-time anomaly detection as a paid
recurring add-on ($500–1,500/mo/facility) — flag → acknowledge (reason
picker) → audit, advisory-only, never blocking. The demo shipped only the
single client rule (`detectAssetAnomaly`, criticality vs consequences) as a
passive inline amber note: no acknowledge button, no reason picker, no
audit, no per-user scoping. AD-1 closes that gap for the Section-3 asset
rule — the visible Author-facing mechanic that demonstrates the add-on.

### Options considered
- A: Leave as the passive note. No demo value; doesn't show the product.
- B: Build the full spec now (server rule engine, 800ms debounce, LLM
  checks, Sections 3/5/6, admin per-facility toggle). Weeks of invisible
  plumbing for no added demo-narrative value.
- C (chosen): Client-only v1 — the asset rule + the acknowledge loop +
  audit, in `WorkspaceContext`. Reusable primitives for later rules.

### Decision
Implement AD-1 as a client-only advisory slice:
- `useAnomalyAcknowledgement` hook (rule id `asset-criticality-consequences`).
- `AnomalyWarningChip` (tokens only) + `AnomalyAcknowledgeModal` (reuses
  shared Modal; reasons Not applicable / False positive / Will address /
  Other, note required iff Other).
- `WorkspaceContext.acknowledgeAnomaly` persists the ack onto the asset and
  appends an `anomaly-ack` audit entry atomically.
- Acknowledgement keyed by rule id + `session.user.id`; a criticality/
  consequences snapshot on the ack auto-invalidates it when either field is
  edited (no explicit clear). Acknowledge UI shown for Author + Draft +
  editable asset only. Advisory — never gates submit/review/approve.

### Rationale
Per §9.2 (L985, L998-1000, L1003-1005, L1009) the add-on's value is the
recurring flag → acknowledge → "logged for tuning" loop, which is pure
client UX. The backend hybrid engine is invisible plumbing and adds no
demo-narrative value, so it is correctly deferred to AD-2+. Front-loading
the client loop maximizes demo / recurring-revenue storytelling at minimal
cost and zero workflow risk (advisory per L1003).

Sub-decisions (Q1–Q3 defaults): per-Author key stored on the asset — demo
assets are workspace-global, so spec's "per-assessment" scoping is
approximated and noted as a v1 limitation (exact once assets become
assessment-scoped server-side); acknowledged chip softens to a muted state
(not hidden) for transparency; audit action `anomaly-ack` matches the
existing lowercase-hyphen vocab rather than introducing `AI_ANOMALY_*`.

### Revisit conditions
- AD-2 lands the server rule engine (deterministic + LLM), 800ms debounce,
  and Sections 5/6 rules — at which point flag events (not just dismissals)
  get logged and acks may move server-side.
- Assets become assessment-scoped (server era) → tighten ack key to true
  per-Author-per-assessment.
- An admin per-facility enable toggle is built (none exists today; AD-1 is
  always-on for the demo).

### Related artifacts
- Implementation: `client/src/components/AnomalyWarningChip.jsx`,
  `client/src/features/assessmentWorkspace/useAnomalyAcknowledgement.js`,
  `.../AnomalyAcknowledgeModal.jsx`, edits to `.../AssetDisaggregationSection.jsx`
  and `.../WorkspaceContext.jsx`.
- Tests: `client/src/data/assets.test.js`, `.../AssetDisaggregationSection.test.jsx`.
- SESSION_LOG 2026-05-29.
- Anomaly arc (handoff):

  | ID | Scope |
  |----|--------|
  | AD-1 | Section 3 asset criticality-vs-consequences + acknowledgement (this) |
  | AD-2 | Anomaly rules for Sections 5 & 6; server engine + 800ms debounce |
  | AD-3 | Admin dismissal-rate / tuning surface (AI Operations Playbook) |
  | AD-4 | Cross-facility consistency flagging (businesslogic Feature 3) |

## 2026-06-01: Demo facility de-identification rename
Three of the demo's mock facilities reused the names of real
refineries/terminals (Lagos Refinery, Bonny Terminal, Fujairah Marine
Terminal). To de-couple the demo from any real site while keeping demo
verisimilitude, renamed to fully fictional names:

- Lagos Refinery → **Eko Petrochemical Hub** ("Eko" is the Yoruba name
  for the Lagos area)
- Bonny Terminal → **Delta Crest Terminal**
- Fujairah Marine Terminal → **Gulf Horizon Terminal**

Pure data rename: 94 literal-text occurrences across 16 client/src files
(zero in server/docs), swept with a scoped `find ... -exec sed -i ''`
plus a single manual edit to a case-insensitive regex in
`AuthorDashboard.test.jsx`. The 3 replacement strings are full
multi-word names — collision-free, order-independent. 139 client tests
pass unchanged; this is purely a string rename with no behaviour change.

Source-of-truth files updated: `auth/session.js`
(`DEMO_SESSION.facilities`) and `data/operators.js` (`FACILITIES` —
prod-shape with `type`, `accountableManager`, `regulator`, etc.). All
derived strings (assessment names like "Eko Petrochemical Hub — 2026
SRA", audit log entries, notifications, mitigations, admin assignments,
dashboard rows, modal copy, section displays) cascaded automatically
through the sed pass.

### Sub-decisions
- **Regions kept** ("Lagos, Nigeria" / "Rivers State, Nigeria" /
  "Fujairah, United Arab Emirates"). "Eko" being acknowledged-Lagos
  makes the regional context consistent; full anonymization would lose
  verisimilitude and expand scope to ~15 more strings.
- **Regulator strings kept** (Department of Petroleum Resources etc.) —
  tied to the kept regions.
- **`accountableManager` names kept** — geographically consistent with
  kept regions; not facility names.
- **fac-4 Pernis Refinery Complex and fac-5 Jurong Storage Terminal NOT
  renamed.** Also real-place names; out of stated scope this pass.
  Logged in `considered-and-deferred.md`.

### Revisit conditions
- A prospect or customer flags the kept geographic context (regions /
  regulators / manager names) as too on-the-nose → second-pass full
  anonymization.
- fac-4 / fac-5 renamed if the demo expands to use them prominently and
  the same de-identification rationale applies.

### Related artifacts
- 16 modified files in `client/src/` (all `*.js`/`*.jsx`).
- SESSION_LOG 2026-06-01 entry.
- Deferred entries in `docs/considered-and-deferred.md`.

## 2026-06-02: Rebrand Vorge (full)
A trademark/identity conflict with a UK company prompted renaming the
project from Vantage to Vorge. Same product, same horizontal lockup
(amber rounded square + white shield), new wordmark, slightly lighter
brand amber.

### Scope
Full sweep across `client/`, `server/`, `docs/`, `scripts/`,
`.claude/hooks/`, root-level docs and Makefile — case-sensitive sed on
both `Vantage` and `vorge`. ~325 occurrences, ~80 files.

### Intentional kept-as-vantage
Three exclusions, all to avoid breaking running infrastructure:

1. **Postgres DB name** in `server/src/config/env.js` + `server/knexfile.js`
   default `DATABASE_URL` (`postgresql://.../vorge`) — sed swept these to
   `vorge` and they were reverted. Matched by docker-compose's
   `POSTGRES_DB`, `container_name` entries and `vantage_pgdata` volume
   which were kept intact (docker-compose.yml not in sweep scope).
   Renaming the DB / containers / volume is a separate (destructive)
   migration that resets local dev databases — out of this rebrand.
2. **`.env.example`** untouched (human review item; secrets/shape
   changes need a separate review).
3. **Drive `Vantage_*.docx`** filename references in `docs/`,
   `SESSION_LOG.md`, etc. The actual Drive files have not been
   renamed; references must continue to point at the real filenames.

### Sub-decisions (Q1–Q3 overrides)
- **Q1 OVERRIDE — migration shim, not hard cut.** New
  `client/src/config/storageKeys.js` centralises the brand-prefixed
  keys; `legacyStorageMigration.js` runs once on app boot (from
  `main.jsx`, before React mounts) and copies any
  `vantage.session` / `vantage.session.token` / `vantage-theme` /
  `vantage:demo:mobile-gate-dismissed` / `vantage:op:*` values to
  their `vorge.*` counterparts, idempotently and best-effort. 5 new
  vitest cases cover the migration. **Server cookies** mirror the
  approach: writes use `vorge_refresh` / `vorge_mfa_trust`; reads
  fall back to legacy names if the new cookie is absent — one release
  window, then drop.
- **Q2 — CTA brand-amber updated.** LoginPage dark-mode Sign-in button
  `dark:bg-[#F49D0D]` → `dark:bg-[#F4B860]` to keep the original
  "match the logo square" cohesion (Vorge's mark amber is the lighter
  `#F4B860`). Hover stays `#FFB020`.
- **Q3 — defer `website/` + Drive `.docx` renames.** Logged in
  `considered-and-deferred.md` so neither is forgotten.

### Logos / favicon
- Provided SVGs at `/Volumes/UOIT GDrive Backup/Business/Security
  Risk/vorge logo/` copied into `client/src/assets/` as
  `vorge-logo-on-{light,dark}.svg`; old `vantage-logo-on-*` assets
  deleted. Imports already swept by sed.
- `client/public/favicon.svg` derived from the light lockup with the
  viewBox clipped to `0 0 37 37` (mark only); linked in
  `client/index.html`.

### Verification
- `cd client && npm test` → 144 passing (139 + 5 migration tests).
- `cd client && npm run build` → clean.
- `cd server && npm test` → 192 passing (unchanged).
- Final case-insensitive grep across all swept paths returned zero
  unintentional matches.

### Revisit conditions
- Old localStorage keys can be dropped (delete the migration shim)
  after a release window where ~all users have been online once.
- Legacy cookie reads in server can be dropped after a similar window.
- DB rename + container rename only when a fresh-DB migration is
  acceptable (likely combined with the move to managed Postgres in
  Phase 3).

### Related artifacts
- New: `client/src/config/storageKeys.js`,
  `legacyStorageMigration.js`, its test,
  `client/src/assets/vorge-logo-on-{light,dark}.svg`,
  `client/public/favicon.svg`.
- Removed: `client/src/assets/vantage-logo-on-{light,dark}.svg`,
  `vantage-logo-on-light.png`.
- Modified: ~80 files swept; `LoginPage.jsx` CTA hex; cookie reads
  in `routes.js` + `mfaTrustDeviceService.js`; `env.js` adds two
  legacy cookie names; `main.jsx` invokes the migration shim.
- SESSION_LOG 2026-06-02; considered-and-deferred entries below.
