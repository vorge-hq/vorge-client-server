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

# Vantage Build — Session Log

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
