# Considered and Deferred

Running list of things considered during builds and parked, with the
conditions that would make them revisit-worthy. Different from the
roadmap (which is committed and scheduled) — this is the "thought
about, said no for now, here's why."

When a deferred item gets picked up, mark the entry with the date and
where it landed, rather than deleting.

---

## Entry format

```
## <Item name>
Considered: YYYY-MM-DD (during <chunk or context>)
Status: deferred | picked up YYYY-MM-DD in <reference>

### What we considered
Brief description.

### Why we deferred
Reasoning.

### Revisit conditions
What would make this worth revisiting.
```

---

## Items

## SMS-based MFA as fallback factor
Considered: 2026-05-26 (chunk 4)
Status: deferred — likely permanent

### What we considered
SMS as a backup MFA factor for users who lose their authenticator
device.

### Why we deferred
SIM swap vulnerability. MSA 8.3.1 explicitly forbids SMS-based MFA.
Recovery codes + admin reset cover the lost-device case adequately.

### Revisit conditions
Unlikely to revisit. If a customer specifically demands SMS for
operational reasons, would require MSA amendment first.

---

## WebAuthn / hardware keys as second factor option
Considered: 2026-05-26 (chunk 4)
Status: deferred

### What we considered
WebAuthn support (hardware tokens like YubiKey, plus platform
authenticators like Touch ID / Windows Hello) alongside TOTP.

### Why we deferred
Doubled chunk-4 surface area. TOTP covers the universal case;
WebAuthn is a discrete enhancement.

### Revisit conditions
- Customer in regulated sector requires hardware tokens
- Procurement checkbox item for a target buyer
- Pen test recommends WebAuthn for Admin/HQ Executive specifically

---

## Step-up MFA before sensitive operations
Considered: 2026-05-26 (chunk 4)
Status: deferred

### What we considered
Beyond login-time MFA, requiring re-verification before specific
sensitive actions (Approve, Recall, Admin actions, configuration
changes).

### Why we deferred
Login-time MFA captures most of the security delta. Step-up adds a
new modal pattern, per-route enforcement taxonomy, and increased UX
friction. Better with real customer feedback on threat model.

### Revisit conditions
- Customer threat model surfaces specific session-stealing concerns
- Pen test recommends step-up for specific high-privilege operations
- Step-up MFA becomes a buyer checkbox

---

## Per-facility configurable MFA policy editor
Considered: 2026-05-26 (chunk 4)
Status: deferred — scheduled for M4-proper

### What we considered
Admin UI with per-facility per-role MFA configuration
(Required-all-sessions / Required-new-devices / Disabled).

### Why we deferred
Doubled chunk-4 surface area to build admin UI alongside enforcement.
Spec calls for it; chunk-4 ships hardcoded as a deferral.

### Revisit conditions
M4-proper milestone — explicitly scheduled.

---

## Configurable lockout thresholds (per-tenant tuning)
Considered: 2026-05-26 (chunk 4)
Status: deferred — scheduled for M4-proper

### What we considered
Lockout thresholds (3 fails → 30s, etc.) configurable per facility
rather than hardcoded.

### Why we deferred
Spec calls for it; deferred alongside the policy editor.

### Revisit conditions
M4-proper milestone.

---

## Full RLS (Row Level Security) on MFA tables
Considered: 2026-05-26 (chunk 4)
Status: deferred — tracked for platform-wide RLS review

### What we considered
PostgreSQL RLS policies on the four new MFA tables (mfa_secrets,
mfa_recovery_codes, mfa_trusted_devices, plus the new users columns)
per the chunk-4 brief's explicit ask.

### Why we deferred
Consistency with chunks 1-3 precedent, where RLS was enabled at the
schema level but specific policies weren't written. App-layer
enforcement (hasSharedFacilityAdmin, user_id-scoped queries) covers
the cross-tenant cases.

### Revisit conditions
Platform-wide RLS audit/implementation pass. When that happens, MFA
tables get the same treatment as everything else.

---

## Redis-backed rate limiting and TOTP replay cache
Considered: 2026-05-26 (chunk 4)
Status: deferred — required before multi-instance deployment

### What we considered
Moving from express-rate-limit's in-memory store and the in-memory
TOTP replay cache to Redis-backed implementations.

### Why we deferred
Single-instance deployment for POC. In-memory works correctly until
horizontal scale is needed.

### Revisit conditions
**Required before any multi-instance deployment.** Both mechanisms
need migrating together.

---

## Deprecation of legacy `users.mfa_enabled` column
Considered: 2026-05-26 (chunk 4)
Status: deferred

### What we considered
Dropping the legacy `users.mfa_enabled` boolean now that
`users.mfa_enrolled_at` (timestamp) carries equivalent information.

### Why we deferred
Existing callers (`publicUser`, `hydrateUser`, client `mfaEnabled`
consumers) still read the boolean. Chunk 4 keeps both columns in sync
via the single-writer pattern.

### Revisit conditions
After all callers migrate to `mfa_enrolled_at`. Small follow-up
migration when ready.

---

## TOTP encryption key rotation
Considered: 2026-05-26 (chunk 4)
Status: deferred — `key_version` column in place for future rotation

### What we considered
Implementing a rotation procedure for `MFA_ENCRYPTION_KEY`.

### Why we deferred
No operational need yet. `key_version` column added to `mfa_secrets`
in chunk 4 schema to support future rotation without further
migration.

### Revisit conditions
- Suspected key compromise
- Regulatory requirement for periodic rotation
- Operational policy decision to rotate annually

---

## Backfill of lockboxes for chunks 0-3
Considered: 2026-05-27 (docs-setup session)
Status: deferred — likely permanent

### What we considered
Retroactively writing lockbox-format decision records for chunks 0
(env-gating), 1 (sessions/logout), 2 (refresh tokens), 3 (password
reset).

### Why we deferred
Diminishing returns. Chunks 0-3 are shipped and working. Reconstruction
would be partial and based on commit messages + code, not fresh
discussion. Lockbox practice starts at chunk 4 and continues forward.

### Revisit conditions
Pen test or end-client review specifically requests chunk-0-3
decision provenance. Reconstruct then-and-there from primary sources.

---

## audit_log_entries table name in lockbox phrasing
Considered: 2026-05-27 (chunk 4 commit phase)
Status: deferred — small lockbox cleanup PR

### What we considered
Tightening the chunk-4 lockbox §NEW-4 phrasing from "same hash-chained
audit log" (concept) to the explicit table name `audit_log_entries`
for unambiguous mapping during pen-test.

### Why we deferred
One-line edit. Not blocking. Better batched with other future lockbox
cleanups.

### Revisit conditions
Any future lockbox revision pass. Or pen-test prep specifically.

---

## Pre-existing seed bug: assessments.contributors JSONB parse error
Considered: 2026-05-27 (surfaced during chunk-4 build)
Status: deferred — not chunk-4 scope

### What we considered
`npm run seed` fails with a JSONB parse error on the
`assessments.contributors` insert. Affects both in-container and
host-direct runs. Pre-existing; not caused by chunk 4.

### Why we deferred
Out of chunk-4 scope. Users insert succeeds before the error fires,
so chunk-4 work is unblocked.

### Revisit conditions
Before next dev environment reset. Or when contributor data is needed
for testing.

---

## Pull request workflow adoption
Considered: 2026-05-27 (chunk 4 commit phase)
Status: deferred — likely permanent unless team grows

### What we considered
Adopting GitHub pull requests as the merge mechanism for chunks going
forward. The repo's "Welcome to pull requests!" empty state confirmed
no PRs had been opened across chunks 0-3.

### Why we deferred
Solo workflow. PRs add overhead without review benefit when there's
one engineer. Branches and forensic tags provide sufficient paper
trail. `gh` CLI is installed but unauthenticated, ready for future
use.

### Revisit conditions
- Adding a second engineer or external reviewer to the project
- Pen-test firm or end-client review wants the formal diff surface
- Operational policy decision to formalize merge workflow

---

## Section completion state — when does a section get a green check?
Considered: 2026-05-28 (during dark-mode contrast fix visual QA)
Status: deferred — product question, out of scope for contrast fix

### What we considered
During visual QA of the active rail item, noticed that only Section 6
has dynamic completion logic (`isSection6Complete` in
`assessmentModel`, derived from `matrix` + `evaluations`). Sections
1–5 and 7–9 fall back to the static `completedSectionIds` array on
the assessment seed, so their green-check indicators reflect seed
data rather than actual document progress. Open question is whether
each section should grow its own derivation predicate (analogous to
`isSection6Complete`), or whether a single shared "section
completeness" check over each section's required fields would be
more maintainable.

### Why we deferred
Out of scope for the dark-mode contrast fix. The rendering itself is
correct — the question is about what should drive the boolean, which
is a product/UX decision touching every section. Warrants its own
deliberate scoping round.

### Revisit conditions
- When the section-completion model is reviewed alongside validation
  rules or workflow gating
- When a section's "complete" indicator is materially wrong in a way
  that blocks reviewer/approver workflow
- When chunk 5+ work touches assessment workflow state

## Full mobile responsive build for demo
Considered: 2026-05-28 (during Phase 1 demo deploy)
Status: deferred

### What we considered
Making every demo screen — sign-in, dashboard, assessments list,
assessment workspace, role switcher, topbar — responsive down to phone
viewports. Either via Tailwind responsive utilities across every screen,
or a separate mobile-first variant routed by viewport.

### Why we deferred
- Vantage's product brief is desk-only: analysts working at their desk.
  Mobile is not a real use case for the platform — it's only a real use
  case for *opening a demo link*. Solving the demo problem (set
  expectations on small screens) is much cheaper than building screens
  the platform doesn't need.
- Cost is non-trivial: assessment workspace, dashboard tables, role
  switcher, topbar all have desk-density information designs that don't
  graceful-degrade. A real responsive build is weeks, not days.
- A soft warning gate addresses the actual harm (bad first impression)
  with one component.

### Revisit conditions
- Field mode M4–M5 ships — Field mode is the one workflow with a real
  on-device-at-a-site use case. When it lands, that subset becomes
  responsive, but the rest of the platform stays desk-only.
- Explicit prospect request for mobile-usable demo, especially from a
  customer profile we want to win.
- Observed funnel drop-off attributable to mobile sessions hitting the
  gate and not converting — vs. desktop sessions that do convert. That
  would tell us the gate is a real barrier, not just a label.

### Related artifacts
- Mobile-warning gate shipped in product-decision-log.md entry
  "Demo-mode mobile viewport gate" (2026-05-28).

## Node installed system-wide; global npm installs need sudo
Considered: 2026-05-28 (during demo deploy recovery)
Status: deferred

### What we considered
Switching from system-wide Node (currently at `/usr/local/`) to a
user-scoped Node version manager — nvm or fnm — so global tool installs
(`npm i -g ...`) don't require sudo.

### Why we deferred
- Hit once during the gate-deploy recovery: `npm i -g vercel@latest`
  failed with EACCES because `/usr/local/lib/node_modules/` is
  root-owned. Worked around by running with sudo in a separate terminal.
- One-off friction, not a blocker. The dev workflow doesn't typically
  involve frequent global installs.
- Switching shells over to a version manager is a non-trivial migration
  touching shell rc files, existing Node installs, and any local global
  tooling already present.

### Revisit conditions
- Global tool installs become frequent in the workflow (e.g. multiple
  CLIs needing periodic upgrades).
- Another EACCES error blocks something time-sensitive — e.g. a deploy
  needs a CLI upgrade and sudo isn't immediately available.
- A new project requires multiple Node versions concurrently.

## Gold CTA in dark mode — apply app-wide + promote to a token
Considered: 2026-05-29 (during LoginPage brand-contrast fix)
Status: deferred

### What we considered
The dark-mode "gold CTA" treatment (brand-amber #F49D0D background +
dark-navy text) shipped on LoginPage's Sign-in button. The same pattern
would benefit every primary CTA across the app (dashboards, workspace,
admin) for visual consistency in dark mode.

### Why we deferred
- Applied as a LOCAL `dark:` utility on LoginPage only, on purpose — a
  global token change would leak gold to every primary button at once,
  unreviewed.
- App-wide rollout is a designer-reviewed decision (does every primary
  action go gold in dark, or only auth/marketing surfaces?).

### Revisit conditions
- Designer signs off on gold-as-primary-CTA in dark mode globally.
- A CTA-token chunk: promote the local #F49D0D utility to an action
  token (e.g. `--action-primary-default` dark override or a dedicated
  `--action-cta` token) and apply via `.btn-primary`.

## Logo: mark-only asset for compact contexts
Considered: 2026-05-29 (during LoginPage logo wiring)
Status: deferred

### What we considered
The repo's logo SVGs (`vantage-logo-on-{light,dark}.svg`) are full
horizontal lockups (amber mark + "Vantage" wordmark). A mark-only asset
(just the amber rounded-square + white shield) would help compact
contexts: favicon, collapsed nav, mobile headers, app icons.

### Why we deferred
- LoginPage needs the full lockup, which already exists and is wired.
- No current surface needs the mark alone. The dark-mode logo question
  the task worried about turned out to be already solved (designer
  shipped both theme variants), so no designer ask is outstanding.

### Revisit conditions
- A compact surface needs the mark without the wordmark. Extraction is
  trivial: the lockup SVG cropped to `viewBox="0 0 37 37"` is just the
  square (the wordmark paths sit at x>37 and clip out).
