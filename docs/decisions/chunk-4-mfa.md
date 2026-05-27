# Chunk 4 — MFA Enforcement: Decision Lockbox

**Status**: pre-implementation
**Created**: 2026-05-26
**Branch**: `feature/auth-mfa`
**Parent**: `cleanup/audit-strip-user-agent` (commit `a28c7f0`)
**Purpose**: Auditor-readable record of every design call made for chunk 4. Every locked decision, every technical bake-in, every deviation from the documented spec, every interpretation of an ambiguous requirement. This document is the load-bearing reference when chunk 4 is reviewed for pen-test, end-client sign-off, or future maintenance.

If the implementation departs from anything in this file mid-flight, the deviation gets recorded here before code lands. No silent design changes.

---

## Locked decisions (17)

| # | Decision | Answer | Date locked |
|---|---|---|---|
| 1 | Factor types | TOTP only. No SMS, no email-as-MFA, no push, no WebAuthn. | 2026-05-26 |
| 2 | Who requires MFA | Per-role hardcoded set: **Approver, HQ Executive, Admin**. | 2026-05-26 |
| 3 | Enforcement timing | **Login-time only.** Step-up MFA for sensitive operations is deferred. | 2026-05-26 |
| 4 | Trust-device | Opt-in checkbox at login, **off by default**, 30-day cookie. | 2026-05-26 |
| 5 | Enrollment timing | First login is blocked for required-but-unenrolled users until enrollment completes. | 2026-05-26 |
| 6 | Mid-engagement role change | If a user gains an MFA-required role mid-engagement, they're blocked from that new role until enrolled; other roles still work. | 2026-05-26 |
| 7 | `mfa_satisfied` lifetime | Whole session; carried through refresh; switch-role keeps it **unless** switching from non-MFA to MFA-required (then re-verify). See Interpretation §I-1 below for the precise reading. | 2026-05-26 |
| 8 | Disable-MFA flow | Requires **both** current password AND current TOTP code. Forbidden entirely for users in an MFA-required role. | 2026-05-26 |
| 9 | Lockout | Geometric: 3 fails → 30s, 5 → 5min, 7 → 30min, 10 → 24h requiring admin reset. | 2026-05-26 |
| 10 | Recovery codes | 10 codes, one-time-use, downloadable + shown once at enrollment, regeneratable from settings (requires current TOTP). Stored bcrypt-hashed at rest. | 2026-05-26 |
| 11 | Admin reset | Same-operator Admin can reset a target user. On reset: kill all target sessions, invalidate all target trust-device cookies, do NOT force password reset. Audit names both `actor_user_id` and `target_user_id`. | 2026-05-26 |
| 12 | Demo mode | Strip the existing fake MFA stage from `LoginPage.jsx` demo path entirely. | 2026-05-26 |
| 13 | Test strategy | TOTP verifier mocked behind `NODE_ENV === 'test' && process.env.__MFA_TEST_MODE__ === '1'`. Boot assertion in `env.js` crashes if both are set with `NODE_ENV === 'production'`. Seed leaves users un-enrolled so dev exercises real enrollment. | 2026-05-26 |
| NEW-1 | Recovery code login | Satisfies MFA for that single session only. User lands on forced re-enrollment screen before any other navigation. On successful re-enrollment, all remaining old recovery codes are invalidated and a fresh set issued. | 2026-05-26 |
| NEW-2 | Policy change vs live sessions | Live session continues for current role. Enforcement bites at next login OR at next role-switch into a now-MFA-required role. | 2026-05-26 |
| NEW-3 | Multi-facility role aggregation | `requiresMfa(user)` walks all role assignments across all facilities. Strictest policy wins. Login is a property of the user account, not facility context. | 2026-05-26 |
| NEW-4 | Audit fields for MFA events | Same hash-chained audit log. Per-event fields: `user_id`, `event_type`, `outcome`, `source_ip`, `timestamp`. Plus `actor_user_id` / `target_user_id` for admin reset. **No** `user_agent`, **no** email, **no** TOTP codes (even hashed). | 2026-05-26 |

---

## Bake-ins (technical choices)

Implementation details that follow directly from the locked decisions, plus the four resolved via pre-implementation clarifying questions. These are not open for re-discussion during build.

- **TOTP parameters**: SHA-1, 6 digits, 30-second period, ±1 window (RFC 6238).
- **TOTP secret**: 32 bytes, base32-encoded for QR/manual entry.
- **TOTP library**: `otpauth` npm package (modern, zero deps, RFC 6238 compliant).
- **Encryption at rest**: AES-256-GCM via Node `crypto`. `MFA_ENCRYPTION_KEY` env var (32 bytes, base64-encoded). Per-row nonce stored alongside ciphertext.
- **`key_version` column** on `mfa_secrets` from day one (single value `1`; supports future key rotation without migration).
- **QR generation**: `qrcode` npm package.
- **Recovery codes**: alphanumeric uppercase, 10 chars each, hyphen-separated for readability, bcrypt-hashed at rest, `used_at` timestamp on use.
- **Pending vs verified secret separation**: enrollment writes to `mfa_secrets` with `verified_at = NULL` (pending). Promoted to verified on first valid TOTP. Pending GC'd after 24h via a `cleanupExpired` repository function (JSDoc TODO for future cron; no scheduler wired in chunk 4).
- **First-verification proves enrollment**: one valid code, not two. Spec is silent; choosing the more user-friendly path.
- **Concurrent enrollment race**: last-write-wins on pending. First to verify gets promoted; loser receives "secret no longer valid, restart enrollment".
- **Boot guards**: server refuses to start if `MFA_ENCRYPTION_KEY` is missing, wrong length, or invalid base64. Additionally, server refuses to start if `NODE_ENV === 'production'` AND `__MFA_TEST_MODE__ === '1'`.
- **Rate limits** across ALL MFA endpoints (enroll-start, enroll-verify, verify, verify-recovery, disable, regen-codes, admin-reset): **10 req/min/user, 100 req/min/IP**. Implementation: `express-rate-limit`, in-memory store.
- **State storage for MFA gates**: `mfa_satisfied` and `must_reenroll` are additive boolean columns on the existing `sessions` table. Survives refresh (refresh rotation copies the flags forward). Single source of truth, server-side.
- **Single-instance scaling caveat**: both `express-rate-limit` and the TOTP replay-protection used-code cache are in-memory. Multi-instance deployment requires Redis-backed migration for **both** mechanisms, tracked together as one follow-up.
- **Legacy `users.mfa_enabled` column retained** and kept in sync with `mfa_enrolled_at` writes. **Single-writer rule**: the only code paths that touch either column are `userRepository.setMfaEnrolledAt(userId, timestamp, trx)` and `userRepository.clearMfaEnrollment(userId, trx)`. Both functions write **both** columns atomically in a single SQL `UPDATE` statement (`mfa_enrolled_at = $ts, mfa_enabled = ($ts IS NOT NULL)`). No other repository function, service, route, migration, or seed touches either column directly. This rule is the only guarantee that the two columns cannot drift; document it in the repository file's module-level JSDoc and enforce by code review. Deprecation deferred to a future migration once all callers (`publicUser`, `hydrateUser`, client `mfaEnabled` consumers) have migrated to `mfa_enrolled_at`. Not a chunk-4 deliverable.

### Audit event taxonomy

The brief enumerates seven MFA-specific audit events. One additional event is added below to keep the taxonomy explicit (rather than overloading an existing event with an `outcome` flag). Complete chunk-4 set:

| Event type | When emitted | Notes |
|---|---|---|
| `auth.mfa_enrolled` | Successful `enroll-verify` completes | `user_id`, `outcome: "enrolled"` |
| `auth.mfa_verified` | Successful TOTP `verify` | `user_id`, `outcome: "totp"` or `"trusted_device"` |
| `auth.mfa_failed` | Bad code on `verify` (does not include `verify-recovery` failures, which are silent to avoid revealing remaining-code counts) | `user_id`, `outcome: "invalid_code"` |
| `auth.mfa_disabled` | Successful `disable` | `user_id` |
| `auth.mfa_recovery_used` | Successful `verify-recovery` | `user_id` (no code, no hash) |
| `auth.mfa_admin_reset` | Successful `admin-reset` | `actor_user_id` AND `target_user_id` |
| `auth.mfa_locked_out` | Lockout threshold tripped on `verify` | `user_id`, `outcome: "<threshold-tier>"` |
| **`auth.mfa_codes_regenerated`** | Successful `regen-recovery-codes` | `user_id`. **Added in chunk 4 (not in brief's list of seven)** — cleaner than piggy-backing on `auth.mfa_enrolled` with an outcome flag. |

---

## Deviations from documented spec (6)

The brief's deviation list (5) plus the RLS-on-MFA-tables deviation that emerged during plan review (6). Each deviation is a defensible departure from spec; each is recorded here so end-client review and pen-test prep have a single source of truth.

1. **Per-role MFA hardcoded vs per-facility configurable.** Spec calls for an Admin policy editor with per-facility config. Chunk 4 ships a per-role hardcode. Deferred to M4-proper.
2. **Three-option per-role policy model collapsed to Boolean.** Spec: Required all sessions / Required new devices only / Disabled. Chunk 4: Boolean per role + user-opt-in trust-device cookie. "New devices only" semantics are achieved differently. Deferred to M4-proper.
3. **Author + Reviewer downgraded from "new devices required" to "not required."** Spec defaults have these at MFA-required-for-new-devices. Chunk 4 has them at no-MFA. **Security posture regression for POC velocity.** Flag for end-client review.
4. **Lockout thresholds hardcoded.** Spec calls for configurable failed-attempt thresholds. Chunk 4 ships the geometric schedule as constants. Deferred to M4-proper.
5. **`user_agent` removed from auth audit metadata.** Strict reading of MSA 8.3.8. Chunks 1–3 included `user_agent` via the `auditAuthEvent` helper; the precursor cleanup PR (`cleanup/audit-strip-user-agent`, commit `a28c7f0`) stripped this. New rule applied consistently from chunk 4 forward. Forensic `user_agent` columns on `sessions` and `password_reset_tokens` rows are NOT affected — those are resource-row metadata, not audit log metadata.
6. **RLS skipped on the four new MFA tables.** The brief explicitly called for RLS ("enforce by RLS that a row is only readable by its owner or by Admins in any facility where the owner holds a role"). Chunk 4 ships **without** RLS on the four new MFA tables (`mfa_secrets`, `mfa_recovery_codes`, `mfa_trusted_devices`, plus the four new columns on `users` which are user-row metadata anyway). Consistency with chunks 1–3 precedent, where the initial schema enabled RLS without writing policies and subsequent tables omitted RLS entirely. App-layer enforcement covers the cross-tenant cases (`hasSharedFacilityAdmin` for admin reset, `user_id`-scoped queries everywhere else). Tracked for follow-up when the RLS pattern is revisited platform-wide.

---

## Rollback flag

**Env var**: `MFA_ENFORCEMENT_ENABLED` (boolean, default `true`).

**Behavior when `false`**:
- Login-time MFA enforcement gate is **bypassed**. Users in MFA-required roles can complete login without an MFA challenge. The session is issued with `mfa_satisfied=true`.
- Switch-role enforcement is also bypassed (same gate).
- **Enrollment endpoints still work** (users who want to enroll proactively can).
- **All audit events still write.** A user logging in without MFA under the rollback flag does NOT silently bypass the audit log; the `auth.login` event is recorded as normal. A single additional log line is emitted at the enforcement-gate site noting that the flag was off, for operator visibility.
- **Schema is not affected.** The MFA tables, columns, and indexes are all in place regardless of the flag.

**Revert procedure**:
1. Flip `MFA_ENFORCEMENT_ENABLED=false` in the environment.
2. Redeploy / restart the server. (Boot guards still run; the flag does not bypass `MFA_ENCRYPTION_KEY` validation.)
3. Users in MFA-required roles can now log in without MFA.
4. Investigate the underlying issue.
5. Flip the flag back to `true` and redeploy when ready.

**Out of scope for rollback**:
- The flag does **not** un-enroll users. Enrolled users with the flag off can still log in; their secret stays in `mfa_secrets`.
- The flag does **not** invalidate trust-device cookies.
- The flag is **not** intended as a long-term operational mode. It's a break-glass for chunk-4-introduced regressions.

---

## Interpretations of ambiguous requirements

### I-1 — Decision #7 lenient reading

Decision #7 says: "Whole session; carried through refresh; switch-role keeps it unless switching from non-MFA to MFA-required, in which case re-verify."

This is ambiguous between two readings:

- **Strict**: Every non-MFA-required → MFA-required switch within a session forces re-verify, even if `mfa_satisfied=true` at session start.
- **Lenient**: `mfa_satisfied=true` at session start is sufficient for any subsequent role switch within the session. Re-verify is only required when a non-MFA-required user becomes MFA-required mid-session via a policy change (the NEW-2 path: an Admin upgraded a role to require MFA while the user was already logged in on that role).

**Chunk 4 adopts the lenient reading.** The rationale: a user who completed MFA at session start has demonstrated possession of the second factor; toggling roles within a single browser session doesn't reduce that proof. The strict reading would degrade UX without a corresponding security gain, since the session itself is already MFA-protected.

This interpretation is recorded here so that future review (or a future engineer reading decision #7 fresh) doesn't accidentally tighten to the strict reading. If the strict reading is later deemed correct, that change goes through a normal design review and lands as its own commit, not as a silent edit.

---

## Pre-code artifact references

- This file: `docs/decisions/chunk-4-mfa.md` (lockbox).
- Companion: `docs/decisions/chunk-4-ui-checklist.md` (5 screens, build mode per screen).
- Plan file (Claude-internal, not committed to repo): `~/.claude/plans/vantage-auth-chunk-bright-lagoon.md`.

## Post-chunk-4 follow-ups (tracked here, not in chunk 4)

- Per-facility MFA policy editor (Admin UI) → M4-proper.
- Configurable lockout thresholds → M4-proper.
- Re-evaluate Author + Reviewer MFA posture (deviation #3) → end-client review.
- RLS pattern for all auth-adjacent tables (chunks 1–3 + chunk 4) → platform-wide review when RLS is revisited.
- Redis-backed migration for `express-rate-limit` AND TOTP replay cache → required before multi-instance deployment.
- Deprecate `users.mfa_enabled` boolean once all callers have migrated to `mfa_enrolled_at`.
- Key rotation: `key_version` column is in place; implement a rotation procedure when the operational need arises.
- Move pending-secret GC and trust-device-cookie GC to a real cron / scheduler.
