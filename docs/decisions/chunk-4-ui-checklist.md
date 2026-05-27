# Chunk 4 — UI Build-Mode Checklist

**Status**: pre-implementation
**Created**: 2026-05-26
**Purpose**: For each of the 5 chunk-4 screens, decide upfront whether it needs designer input before build, or whether Claude ships in the default Vantage style. Per the brief: default to "Claude's judgment, ship in default style" for chunk 4 unless the screen has obvious UX risk.

The Vantage default style (established in `LoginPage.jsx`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx` from chunks 0–3):
- Centered `max-w-[400px]` card on `bg-surface-sunken`.
- Vantage brand header (Shield icon + "Vantage SRA Platform" tag).
- `space-y-3` form layout with `field-label` / `field-control` paired inputs.
- `btn-primary` for primary action, `Banner` component for success/danger states.
- Audit-trail footer line: `<Lock /> + "All [...] attempts are logged to the immutable audit trail."`

| # | Screen | File | Build mode | Risk flags / notes |
|---|---|---|---|---|
| 1 | **Enrollment** | `client/src/pages/auth/MfaEnrollPage.jsx` | **Claude's judgment, ship in default style** | Standard QR + manual-key + verify-code flow. Vantage style accommodates it directly. Only non-trivial detail: the recovery-code one-time display needs a clear "DOWNLOAD .TXT" affordance + an explicit "you will NOT see these again" warning before the user can dismiss. Will draft inline. |
| 2 | **Verify-at-login** | `client/src/pages/auth/MfaVerifyPage.jsx` | **Claude's judgment, ship in default style** | 6-digit input, "use recovery code" link toggles to recovery mode, "remember this browser for 30 days" checkbox (default off). Lockout messaging is a Banner with remaining-time countdown. No designer input needed. |
| 3 | **Lockout** | `client/src/pages/auth/MfaLockoutPage.jsx` | **Claude's judgment, ship in default style** | Static page with remaining-time display. Two states: timed lockout (30s/5min/30min — countdown) and admin-reset lockout (24h tier — "Contact your administrator"). No attack-vector hints in copy. Trivial in default style. |
| 4 | **MFA Settings** | `client/src/pages/auth/MfaSettingsPage.jsx` | **Claude's judgment, ship in default style** | **No user-settings page wrapper exists** in the codebase as of chunk 3 (verified: no `client/src/pages/settings/` directory, no shared settings shell). Decision: ship standalone in the existing Vantage form-card pattern, file located in `pages/auth/` alongside `ForgotPasswordPage` / `ResetPasswordPage` (consistent with the other auth-flow pages). URL stays `/settings/mfa` for future-proofing — when a settings hub does land later, the file can move to `pages/settings/` without breaking links. Building a user-settings shell is **out of scope for chunk 4**. Content: status row, Disable button (gated behind a password+TOTP `Modal`), Regenerate codes button (TOTP `Modal`). For users in MFA-required roles, the Disable button is hidden and replaced with explanatory copy ("MFA is required for your role and cannot be disabled. Contact an admin to change role assignments."). |
| 5 | **Admin Reset modal** | `client/src/features/admin/MfaResetModal.jsx` | **Claude's judgment, ship in default style** | **Existing `Modal` component confirmed** at `client/src/components/Modal.jsx`; chunks 0–3 already use it from 8+ feature modals (`features/assessmentWorkspace/modals/*.jsx`, `features/assessmentWorkspace/RemoveFromScopeModal.jsx`). Decision: `MfaResetModal` is a thin wrapper around this existing component. No new dialog primitive needed. Content: confirmation dialog, names the target user, lists destructive consequences (sessions killed, trust cookies invalidated, secret wiped, user will re-enroll on next login). Confirm button → POST `/api/auth/mfa/admin-reset` → refresh user row in the Admin UI. |

## Risk summary

None of the 5 screens are flagged as "needs designer input before build." Reasoning:
- Each screen has a clear, single-purpose CTA.
- The Vantage form-card pattern is established and well-tested through chunks 0–3.
- The destructive admin-reset modal has the most copy nuance, but the consequences list is plain English that can be reviewed at PR time without blocking the build.

If any screen develops UX rough edges during build, that's worth surfacing in the chunk-4 summary — but the default plan is to ship all five in default style on first pass.
