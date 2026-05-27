# Historical Context — Pre-Chunk-4 Documentation

This file indexes documentation produced before the lockbox/decision-log
pattern was adopted at chunk 4. The canonical versions of these
documents live outside the code repo.

**Location**: `Backup/Business/Security Risk/` on the project owner's
local drive (backed up to personal Google Drive).

For technical decisions made from chunk 4 forward, see:
- `docs/decisions/chunk-<n>-<name>.md` (lockbox pattern)
- `docs/decisions/product-decision-log.md` (running product decisions)

---

## Document index

### Engagement & build planning
- **Vantage_Master_Build_Plan.docx** — coordination doc across dev,
  designer, and AI ops owner. M1-M6 milestone schedule.
- **Vantage_Dev_Build_Plan.docx** — dev-team-specific scope, effort
  estimates by domain, milestone mapping.
- **Vantage_Designer_Build_Plan.docx** — design scope, screen
  inventory, deliverables per milestone.
- **Vantage_AI_Features_Specification.docx** — the six AI features and
  the AI service module architecture.
- **Vantage_AI_Operations_Playbook.docx** — post-launch AI ops
  procedures (prompt iteration, rule curation, cost management).

### Customer-facing
- **Alora_SRA_Proposal.docx** — customer proposal with platform
  capabilities, pricing structure, hosting tiers.
- **Platform_Overview.docx** — customer-facing platform summary.
- **Workflow_Validation.docx** — 26 workflows the platform supports,
  validated against customer expectations.
- **Vantage_User_Flows.docx** — detailed workflow specifications
  (authoritative for dev behavior).
- **Vantage_Design_Brief.docx** — design direction, screen complexity
  matrix, mobile/desk usage profile.
- **Comparison_Sheet_OnePage.docx** — one-page customer comparison.

### Internal strategy & operations
- **Vantage_Product_Roadmap.docx** — feature roadmap, revenue streams,
  pricing philosophy.
- **Competitive_Analysis_vs_Sphera.docx** — competitive positioning
  and differentiators.
- **Vantage_Internal_Build_Estimates.docx** — internal cost estimates
  (NOT for dev/customer sharing).
- **Milestone_Payment_Schedule.docx** — dev team payment cadence
  (internal reference only).

### Legal
- **Dev_Team_MSA.docx** — Master Services Agreement with dev team.
  Section 8.3 contains the security obligations chunks 1-4 are built to
  comply with.
- **Dev_Team_Pre-Engagement_NDA.docx** — pre-engagement NDA.

### Templates
- **Security_Risk_Assessment_Template.docx** — the SRA template the
  platform digitizes.

### Deployment reference
- **Vantage_Vercel_Deployment_Guide.docx** — deployment procedures.

---

## Why these aren't in the code repo

Strategic/legal/customer documents have different audiences and update
cadences than engineering records. They get edited in Word with
tracked changes, reviewed by lawyers and customers, and don't fit the
commit-based workflow of a code repo.

For documents where engineers touching the codebase need to know a
decision was made (e.g., customer-facing copy, security obligations),
inline pointers exist in the relevant code locations or in
`docs/marketing-positioning-pointer.md`.

---

## Coverage gap acknowledgment

Chunks 0-3 (env-gating, session revocation, refresh tokens, password
reset) were built before the lockbox/decision-log pattern was adopted.
Records for those chunks are limited to:

- Commit messages on each branch (see `git log` for each
  `feature/auth-*` branch)
- Forensic tags at each chunk boundary
  (`pre-auth-logout`, `pre-refresh-tokens`, `pre-password-reset`,
  `pre-cleanup-user-agent`)
- The Dev_Team_MSA.docx security obligations they were built against
- Notes.txt entries reconstructed retroactively (see `Notes.txt`)

If detailed decision records for chunks 0-3 are needed for pen test or
audit, reconstruct from commits + tests + code at that time. The
lockbox pattern starts at chunk 4 going forward.
