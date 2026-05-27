# Product Decision Log

Running record of significant product, feature, and architecture
decisions across the Vantage platform. Append-only — when a decision
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
residue from a different project — gold is Vantage's identity color
(logo, sparkle marker, selective accent pills), not an action color.

### Options considered
- A: Adopt gold as CTA button color per designer's preview HTML
- B: Reserve gold for identity uses only; CTAs use the primary navy

### Decision
B.

### Rationale
Gold is the Vantage identity mark. Repurposing it as a primary CTA
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
review as a role overlap. Teal is Vantage's AI affordance color (per
chunk-0 dark mode sweep, commit 9d8d372). Success and progress have
semantic-green and severity-low coverage already.

### Options considered
- A: Allow teal to cover both AI affordances and success/progress
- B: Reserve teal exclusively for AI affordances; success uses semantic
     green (#4ADE80), progress uses sage (severity-low)

### Decision
B.

### Rationale
Teal is a strong visual signal in the Vantage palette. Reserving it
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
