# BusinessLogic.md

**Vantage SRA Platform — Business Logic Specification**

> Compiled for the Vantage build. This document is the canonical source of truth for **what the platform does** — the rules, behaviours, entities, workflows, and edge cases the application must implement.
>
> **It is not a technical-stack spec.** Tech stack, API design, deployment, and code structure are covered in companion docs (`server.md`, `client.md`, `readme.md`). This file should drive what the code does, not how it's built.
>
> **`TODO:` and `QUESTION:` markers** flag gaps where source documents conflict, are silent, or where a human decision is needed before development. Resolve these before handing off to a developer or AI coding assistant. Search the document for `TODO:` and `QUESTION:` to find them all.

---

## Table of contents

1. [Overview & naming conventions](#1-overview--naming-conventions)
2. [Core entities & relationships](#2-core-entities--relationships)
3. [Roles & permissions](#3-roles--permissions)
4. [Authentication, MFA & sessions](#4-authentication-mfa--sessions)
5. [Assessment lifecycle (4-state machine)](#5-assessment-lifecycle-4-state-machine)
6. [The 9 SRA sections (per-section behaviour)](#6-the-9-sra-sections-per-section-behaviour)
7. [Section 7 mitigation tracking & Mitigation Owner workflow](#7-section-7-mitigation-tracking--mitigation-owner-workflow)
8. [Field mode (PWA, per-section checkout, offline auth)](#8-field-mode-pwa-per-section-checkout-offline-auth)
9. [AI features](#9-ai-features)
10. [Audit log & version history](#10-audit-log--version-history)
11. [Locking system (4 lock types)](#11-locking-system-4-lock-types)
12. [Library management](#12-library-management)
13. [Admin configuration surfaces](#13-admin-configuration-surfaces)
14. [HQ Executive dashboard](#14-hq-executive-dashboard)
15. [Notifications](#15-notifications)
16. [Document export](#16-document-export)
17. [Multi-facility / multi-tenant architecture](#17-multi-facility--multi-tenant-architecture)
18. [Non-functional requirements](#18-non-functional-requirements)
19. [Reference data (seed values)](#19-reference-data-seed-values)
20. [Open questions & TODOs (consolidated)](#20-open-questions--todos-consolidated)
21. [Out of scope for v1 (explicit)](#21-out-of-scope-for-v1-explicit)
22. [Glossary](#22-glossary)

---

## 1. Overview & naming conventions

### What Vantage is

Vantage is a multi-tenant B2B web application that replaces the existing Word-document Security Risk Assessment (SRA) workflow with a structured, multi-user, audit-defensible system. It is purpose-built for security consultancies that deliver SRA engagements to operator clients (oil & gas, mining, ports, critical infrastructure, etc.), with a deployment model that supports the consultant delivering an engagement and then transitioning ongoing platform ownership to the operator's team.

Each **facility** (refinery, terminal, FPSO, depot, etc.) is its own deployment unit. An operator may have many facilities deployed; isolation between facilities is strict at the data layer.

### Naming

- **Alora** — the company that operates the platform (the consultancy / SaaS vendor). Internal name; never user-visible inside the product.
- **Vantage** — the platform itself. This is the user-facing brand.
- **Operator** — the customer organisation. Owns one or more facilities. Has its own users, configuration, and HQ-level views.
- **Facility** — a deployment unit (refinery, terminal, FPSO, depot, mining site, port, etc.). The atomic unit of isolation. Every assessment, library entry, configuration, and user role is scoped to a facility (or to a list of facilities for multi-facility users).
- **Assessment** (also called an SRA, an SRA cycle) — a single instance of the 9-section template completed for a facility, typically annually. Has a state, a Lead Author, a versioned history.
- **Cycle** — colloquial for "the round of work that produces one Assessment." Annual is typical.

### Document conventions

- "**Must**" indicates a required behaviour. "**Should**" indicates a default that may be configured. "**May**" indicates an option.
- Where a feature is "**optional**" (e.g. AI drafting, smart tagging, anomaly detection), it can be enabled/disabled per facility in Admin configuration.
- `TODO:` and `QUESTION:` markers indicate items to resolve before development.

---

## 2. Core entities & relationships

The data model is anchored on a small number of entities. The relational structure of Sections 3–7 is the engineering centre of gravity; get this right and most of the rest is mechanical.

### Primary entities

| Entity | Description | Key relationships |
|---|---|---|
| **Operator** | A customer organisation. The top-level multi-tenant boundary. | Has many Facilities, many Users (via role assignments). |
| **Facility** | A deployment unit. The atomic unit of data isolation. | Belongs to one Operator. Has its own Configuration, Library, Users (via role assignments), and Assessments. |
| **User** | A platform user with email, password, MFA configuration, and role assignments. | Has many Role Assignments (per-facility). May hold the Mitigation Owner role across multiple facilities. |
| **Role Assignment** | Maps a User to a Role at a Facility (or to multiple facilities for cross-facility roles). | User × Facility × Role. |
| **Assessment** | One instance of the 9-section SRA for a Facility in a given cycle. | Belongs to a Facility. Has one Lead Author (changeable via reassignment). Has a State, a Version, an immutable Audit Log subset, and a frozen Configuration snapshot at approval. |
| **Asset (Section 3 Item)** | A component of the facility being assessed. | Belongs to one Assessment. Has Dependencies on other Assets (within the same Assessment). |
| **Threat (Section 4 Category)** | A threat classification rated for the facility. | Belongs to one Assessment. The list defaults to 8 categories (configurable per facility). |
| **Asset×Threat link (Section 5 cell)** | A boolean indicating that a given Threat applies to a given Asset within an Assessment. | Derived from Sections 3 and 4. |
| **Evaluation (Section 6)** | The analytical record for one Asset × Threat combination. Captures the risk scenario, consequences, controls, vulnerabilities, R1, proposed mitigation, R2. | Belongs to one Assessment. References one Asset and one Threat. R1/R2 are calculated from configurable matrix. Spawns one or more Mitigations for Section 7. |
| **Mitigation (Section 7)** | A tracked action item derived from an Evaluation's Proposed Mitigation. Has a two-phase lifecycle: pre-approval (Author edits) and post-approval (Mitigation Owner edits). | Belongs to one Evaluation. Has zero or more Progress Log entries (post-approval, append-only). |
| **Progress Log entry** | An append-only note on a Mitigation; can carry a Status transition. | Belongs to one Mitigation. Authored by a Mitigation Owner (post-approval only). |
| **Contributor** | A non-user person who fed information into an Assessment. Recorded in Section 9 appendix. **Not a User; no login.** | Embedded record on the Assessment. Surfaced via autocomplete from a derived directory query over historical Assessments. |
| **Library Entry** | A reusable, searchable text fragment used as a suggestion when filling Sections 3, 5, 6, 7. Five library types: Scenarios, Mitigations, Vulnerabilities, Controls, Consequences. | Scoped to a Facility. Embedded as vectors for semantic search (pgvector). |
| **Audit Log Entry** | An immutable record of any change to structured data, sign-in, role switch, configuration change, lock/unlock, AI call, or workflow transition. | Belongs to a Facility (and usually to an Assessment). Cannot be edited or deleted by any role. |
| **Version** | A snapshot of an Assessment finalised at the moment of approval. | Belongs to an Assessment. Frozen alongside the Configuration in force at approval time. |

### Critical structural rules

- **`facility_id` is on every row of every assessment-related table from day one.** Multi-facility architecture is non-negotiable build scope. Do not retrofit.
- **Row-level security (RLS) enforces facility isolation at the database layer**, not just the application. A user at Facility A must never read data from Facility B except via an explicit cross-facility role (HQ Executive within an operator portfolio, or a cross-facility Admin held by the consultant).
- **Contributors are embedded records on the Assessment**, NOT foreign-key references to a separate contributors table. This preserves historical accuracy when a contributor's role/company changes between cycles. The "contributor directory" used by Section 9 autocomplete is a **derived view computed at query time** over historical assessments — there is no separate CRUD interface.
- **The 5×5 matrix, threat classifications, consequence axes, risk band thresholds, asset criticality levels, libraries, notification triggers, MFA policies, audit retention, and export template are all per-facility configuration data**, not hardcoded application logic.
- **An approved Assessment freezes the Configuration in force at the time of approval.** Subsequent configuration changes do not retroactively alter approved assessments. Implementation: snapshot the relevant configuration into the Version record at approval time.

---

## 3. Roles & permissions

There are **six platform roles**. A single user may hold multiple roles across different facilities (or even multiple roles at the same facility — see "Dual-role" rules below). Permissions are enforced **server-side** based on the user's authenticated identity, the role they are currently acting under, the assessment state, and facility-level policy. **Visible UI affordances do not grant access**; every API endpoint must validate role, assessment state, and facility access independently.

### 3.1 Role definitions

#### Author (Lead Author)

The analyst at a facility who owns an Assessment. Drafts and edits content, conducts interviews, runs workshops, walks the site, gathers input from contributors, and commits the work.

**Can:**
- Create a new Assessment for any facility where they hold the Author role.
- Edit any field in any section while the Assessment is in `Draft` state.
- Delete or modify their own draft data (with audit trail).
- Add or remove Contributors (Section 9) including using the directory autocomplete.
- Submit the Assessment for review (their signature event — stamps Author signature with submission date).
- Withdraw a submitted assessment back to `Draft` (recalls it from the Reviewer; see Workflow).
- Resubmit after a send-back from Reviewer or Approver.
- Reassign Lead Author to another platform user with Author rights at this facility (audit-logged handover; see §5.5).
- Read the audit log for assessments at their facility (field-level edit history within the current draft, surfaced inline).
- Use library suggestion / search when filling fields.
- Use AI drafting (Sections 1 & 8) when enabled.

**Cannot:**
- Approve. Cannot decide on their own work.
- Edit a locked field (locked by Reviewer or Approver) even after a send-back to Draft.
- Edit Section 7 mitigation Status or progress notes after approval — those are the Mitigation Owner's authority.
- Edit assessment content after approval. Approved Assessments are read-only; changes require a new Version (re-approval cycle).
- Comment in another facility's assessment unless they also hold a role there.

**Pre-approval edits to Section 7 fields they own:** Mitigation description, Severity (read-only, derived), Agreed (Yes / No / Pending), Owner (from Pool dropdown), Target date.

> `QUESTION:` Is "Author" and "Lead Author" the same role-name, or do we need a separate "Contributor Author" / deputy role for handover targets? Source docs use "Lead Author" emphatically when discussing single-accountability and reassignment, but the role name in tables is just "Author." Recommend treating "Lead Author" as a designation on the Assessment (the user currently filling that slot) and "Author" as the platform role. Confirm.

#### Reviewer

Reviews the Author's work after submission. Quality control before management sign-off.

**Can:**
- Read any Assessment in their queue (any facility where they hold Reviewer role).
- Read assessments in `Draft` state (advance familiarisation) — see §5.2 sub-flow.
- Add comments at section level or attached to a specific Asset, Threat, Evaluation, or Mitigation field — **only while the Assessment is in `In Review` state**.
- Lock specific fields they have validated (Type 2 lock; see §11). Locked field cannot be edited by Author even after send-back.
- Unlock fields they (or another Reviewer) previously locked.
- Mark the review complete (their signature event — forwards to Approver).
- Send back to Author with a mandatory reason (clears Author and Reviewer signatures; resets Reviewer state).

**Cannot:**
- Edit any Author-authored content under any circumstance.
- Comment in `Draft` (pre-submission), `Awaiting Approval`, or `Approved` states.
- Take Approver decisions (approve, send back to Reviewer, reject).
- See the My Mitigations dashboard.

#### Approver

The facility manager who signs off on the assessment after the Reviewer has marked it complete.

**Can:**
- Read the full Assessment after the Reviewer marks complete (Awaiting Approval state).
- Read assessments in earlier states (Draft, In Review) for advance familiarisation — see §5.3 sub-flow.
- Make exactly one of three decisions on an Awaiting Approval Assessment:
  - **Approve** with optional note (the note flows into the exported document's Document Approvals section).
  - **Send back to Reviewer** with mandatory reason (clears Reviewer signature only; Author signature retained).
  - **Reject** with mandatory reason (returns assessment to Draft, clears all three signatures, resets Reviewer state).
- View the full audit log for any Assessment within their facility (via Audit tab on each Assessment).
- Unlock fields previously locked by a Reviewer.
- Receive notifications about consistency flags (when Cross-facility Consistency Flagging add-on is enabled).

**Cannot:**
- Edit any content. Approver is decision-only, not editor.
- Leave per-field comments — comments are tied to decisions only (the optional Approve note, the mandatory Send-back / Reject reasons).
- Work in the My Mitigations dashboard.

#### HQ Executive

Headquarters leadership. Cross-facility / cross-operator-portfolio visibility.

**Can:**
- See an enterprise dashboard aggregating data across all facilities they have HQ access to within their operator's portfolio.
- Drill into any facility's full Assessment (read-only) within their portfolio.
- See cross-facility heatmap, trends, overdue mitigations summary.
- See AI-generated consistency flags (when Cross-facility Consistency Flagging add-on is enabled).
- Compare any two Versions of an Assessment side-by-side.
- See audit summaries (who approved what when) across all facilities — but **NOT field-level edit details** (those are restricted to the facility's Approver and Admin).
- Leave comments visible to that facility's Approver. `TODO:` confirm whether HQ comments are persistent inline annotations on assessments or a separate channel; the Platform Overview says "leave comments visible to the Approver" but the User Flows §3 says HQ Executive "cannot comment." Reconcile.

**Cannot:**
- Edit anything.
- Take any workflow action (sign, approve, send back, reject).
- See the Mitigation Owner My Mitigations dashboard.
- Cross-operator data — HQ Executives are scoped to their operator's portfolio.

> `TODO:` Resolve the comment-vs-no-comment conflict between Platform Overview and User Flows for HQ Executive. Suggested resolution: HQ Executive **may** leave a comment on an approved or in-review assessment that surfaces to the facility's Approver as a notification; the comment is read-only by the recipient and lives at the assessment level (not inline per field). Confirm.

#### Admin

Facility-level configuration owner. Manages users, roles, and platform-wide rules. Typically a small number of trusted people.

**Can:**
- Create, edit, disable users; assign roles per facility.
- Create or edit facilities (where allowed by deployment scope).
- Configure Platform Configuration (matrix, threats, consequence axes, risk band thresholds, criticality levels).
- Configure five Libraries (Scenarios, Mitigations, Vulnerabilities, Controls, Consequences).
- Configure Notifications (which workflow events trigger emails, recipients, escalation rules).
- Configure Export Template (default standard SRA; custom templates are a Phase 3 add-on).
- Configure Default Assessment Teams per facility (default Author / Reviewer / Approver, used to pre-populate Document Approvals on new assessments).
- Configure Mitigation Owner Pool per facility (role labels mapped to current users).
- Configure per-role MFA policy.
- Configure offline authentication parameters (max offline window, min PIN length, failed-attempt threshold, biometric availability).
- Configure dual-role-on-assessment policy (Block / Warn / Allow).
- View any audit log (with reason logging — Admin must enter a reason for accessing facility-specific logs; this access itself writes an audit entry).
- Export audit logs to CSV (the export action itself is logged).
- Apply or release Type 4 facility administrative locks (rare, for audit/investigation/dispute scenarios).

**Cannot:**
- Edit assessment content. Admin is configuration-only; never an editor of analytical content.
- Delete or modify audit log entries. **No role, including Admin, can mutate the audit log.**
- Manage Contributors (no Contributors CRUD surface exists).
- See the Mitigation Owner My Mitigations dashboard.

> Note on the consultant-vs-operator Admin: the consultant (Alora) typically holds Admin during the engagement and assigns Admin to one or more operator-side users at handover. The consultant may optionally retain a cross-facility Admin role for ongoing support; this is configured per engagement. See §5.7 (handover) and §17 (multi-tenancy).

#### Mitigation Owner

The person responsible for executing approved mitigations. Often a vendor, junior staff member, or specialist outside the SRA workshop. Held via the **Mitigation Owner Pool** — Admin maps role labels (e.g. "Security Manager", "IT Director") to platform users, and Authors assign mitigations to role labels in Section 7. The user the label resolves to gains the Mitigation Owner role for the open mitigations carrying that label.

**Can:**
- Sign in and land directly on the **My Mitigations** dashboard (their home screen).
- See KPI cards (Open / In Progress / Overdue / Done this year) scoped to mitigations assigned to them across all facilities they have access to.
- See a Pending Assignments banner when proposed as Owner on a not-yet-approved assessment (advisory; read-only until approval).
- Open a mitigation detail panel to:
  - Update **Status** (Open → In Progress → Done) on **approved mitigations only**.
  - Add **progress notes** (append-only log entries) on approved mitigations only.
- See the full progress log for their assigned mitigations.

**Cannot:**
- See or navigate to Sections 1–9 of any assessment. The chrome simply does not render those nav items (not greyed-out — absent).
- See Configuration, Admin, or other dashboards.
- Edit Mitigation description, Severity, Agreed status, Owner, or Target date — these lock at approval.
- Cancel a mitigation. Cancellation is the Author's authority during a new cycle. Mitigation Owner can flag intent to cancel via a progress note; Author and Approver decide in the next cycle.
- Revert a mitigation from Done to In Progress or Open. **Done is terminal.** Reverting requires the Author's authority via a new assessment cycle.
- Use any AI feature. The Mitigation Owner UI contains no AI affordances; server-side AI endpoints return 403 for Mitigation Owner sessions.

**Status transition rules:**
- `Open → In Progress`: progress note optional. Save button is labelled "Update status."
- `Open → In Progress` with progress note: same as above; note appended.
- Progress note without a status change: allowed at any post-approval moment. Save button labelled "Add note."
- `In Progress → Done`: progress note **REQUIRED**. Save button labelled "Mark as Done." Form prevents submission with empty note. Server returns 400 if endpoint called without note.
- `Done → anything`: rejected. Server returns 400.

**Cross-facility scope:** A Mitigation Owner who holds the same role label across multiple facilities (e.g. "IT Director" mapped to a single user across all of an operator's facilities) sees mitigations from all those facilities in one view. Facility name is shown prominently per row.

**Pool role-holder change behaviour:** When Admin updates a Pool mapping (e.g. "Security Manager" was user A, now user B), **all open mitigations transfer automatically** to user B. User A loses access. User B receives an in-platform notification ("You've inherited N mitigations from the Security Manager role"). All progress log entries from user A are preserved with original attribution. New entries by user B are attributed to user B. Inherited mitigations are flagged "Recently inherited" on user B's dashboard for the first 30 days. Audit log writes the Pool change with timestamp, admin user, label, previous holder, new holder, count of mitigations affected, optional reason. The Mitigation Owner API endpoint re-checks held role labels at request time (not session start) so the change takes effect immediately.

### 3.2 Multi-role users

Some users hold more than one role. A senior analyst at a small operator might be both Author at one facility and Reviewer at another. The platform supports this without forcing separate accounts.

**Role switching:**
- A "switch role" affordance appears in the topbar **only** for users who hold more than one role. Single-role users do not see it.
- The dropdown lists **only** the roles the user actually holds. The role list is filtered server-side; no client-side role list is trusted.
- Switching may trigger MFA re-authentication depending on facility policy. Default proposal: Approver and Admin always require MFA at switch; other roles optional. Configurable per facility.
- If MFA fails or is cancelled, the switch does not complete; the user remains in the previous role. Failed attempt is logged.
- On successful switch: new role's permissions loaded fresh from server; audit log records both the role left and the role entered with timestamp.
- All subsequent actions until the next switch are logged with the new acting role as audit context.

**Demo behaviour vs production:** The demo includes a free "Demo: switch role" dropdown allowing switching between all six roles without MFA. This is labelled with an amber "Demo:" prefix and a tooltip stating "Production: switching is filtered to roles you hold and may require MFA." **The dev MUST NOT implement the demo's free switching in production.** The two switchers are distinct components.

### 3.3 Dual-role on the same assessment

Configurable per-organisation policy `permitDualRoleOnAssessment` controls whether the same user can hold both Reviewer and Approver roles on a single assessment:

- **Block** — platform refuses the assignment (error at assignment time). Independence of approval is enforced by the platform.
- **Warn** (default for new tenants) — assignment is allowed; at the approval decision point, an acknowledgement modal appears **before** the standard decision modal. Modal title: "Dual-role acknowledgement required." Body: "You are acting as both Reviewer and Approver on this assessment. This reduces the independence of the approval. Confirm to proceed." On confirm, the audit log records the dual-role acknowledgement event. The exported document's Document Approvals section notes "(dual-role acknowledged)" beside the user's name in the Approver row.
- **Allow** — assignment permitted without acknowledgement modal. Audit log still records that the same user filled both roles. Appropriate for the smallest operators where alternatives are not practical.

> `TODO:` Confirm whether the Block / Warn / Allow policy is per-organisation, per-operator, or per-facility. Sources are inconsistent — Platform Overview says "per organisation," User Flows says "per facility," Workflow Validation says "per organisation." Recommend per-facility because the rest of the configuration model is per-facility; an operator with mixed-size facilities may want different policies. Confirm.

### 3.4 Server-side enforcement (canonical rule)

Every API endpoint must validate **all four** of:
1. The user's authenticated identity (token valid, MFA satisfied where required).
2. The role they are currently acting under (server-fetched, never client-supplied).
3. The assessment state (or other resource state — facility lock status, etc.).
4. Facility-level policy (cross-facility access rules, dual-role policy, MFA policy, etc.).

**Visible UI elements never grant access.** A button rendered on a screen does not authorise the user to use it. The platform's permission layer is the only authority.

---

## 4. Authentication, MFA & sessions

### 4.1 Sign-in

Vantage uses **dedicated platform credentials**, NOT corporate single sign-on (SSO via SAML or OIDC is **explicitly out of scope** at client request). This is a deliberate security architecture choice that keeps the platform isolated from the broader corporate identity system.

- Each user has their own email and password specific to Vantage.
- Passwords stored using a strong password-hashing function (bcrypt or stronger; Argon2 acceptable).
- **Failed login attempts are rate-limited** and accounts lock automatically after a configurable number of failures.
- **Every sign-in attempt** (successful or failed) writes an audit entry with timestamp, user, source IP, MFA outcome (where applicable), and result.
- Password reset goes through email verification.
- Session timeouts apply after a period of inactivity; configurable per facility.

> `TODO:` Specific password complexity policy (min length, character classes, history, expiry) is unspecified. Recommend minimum 12 characters, no enforced complexity rules beyond that (per current NIST guidance), with breach-list checking via HaveIBeenPwned API or similar. Confirm with security team. Configurable per organisation per the Workflow Validation document.

### 4.2 MFA enforcement (per-role policy)

MFA is enforced **per role**, with the policy configurable per facility by Admin.

- **The per-role policy is the rule** (does this role require MFA?).
- **The per-user MFA status is the fact** (does this user have MFA configured?).
- A user holding **multiple roles inherits the strictest policy** of any role they hold.
  - Example: a user with Author (MFA optional) and Approver (MFA required) must have MFA enabled.
- If a user has MFA enabled but their role policy changes to no-longer-required, their MFA status is **preserved** (they keep MFA on). The policy controls enforcement, not configuration.

**Default proposal for most operators:**
- **MFA REQUIRED:** Approver, HQ Executive, Admin
- **MFA OPTIONAL:** Author, Reviewer, Mitigation Owner

Rationale for Mitigation Owner default-optional: some Mitigation Owners are vendors, contractors, or junior staff for whom MFA enforcement adds friction without proportionate benefit. Operators who require MFA for all roles can flip the policy.

**Implementation rules:**
- MFA enforcement check happens **at session creation**, not at every request.
- A user without MFA whose role newly requires MFA will be prompted to enable on next sign-in.
- Per-role policy data lives at facility level; per-user MFA status lives at user level.
- TOTP-based MFA is the default mechanism. Hardware token / WebAuthn support is out of scope for v1; flag if a customer specifically requires it.

### 4.3 MFA at role switch

When a multi-role user switches role within a session, the server checks facility MFA policy for the role being entered. If the role requires MFA and the user has not authenticated for that role within the session window (or the role always requires MFA), the user is prompted for MFA before the switch completes. See §3.2.

### 4.4 Offline authentication

Offline authentication uses pre-authorise + PIN/biometric — covered fully in §8 (Field mode). Key constraint: **the full password is never cached on-device.** Only a PIN hash and a server-signed offline session token bound to the device fingerprint.

### 4.5 What's out of scope for v1

- SSO via SAML / OIDC — explicitly excluded at client request.
- Hardware token (YubiKey, etc.) MFA — flag if requested.
- Adaptive / risk-based authentication — out of scope.
- Customer-managed identity providers — out of scope.

---

## 5. Assessment lifecycle (4-state machine)

### 5.1 The four states

Every Assessment is in **exactly one** of four states. State transitions are triggered by specific user actions and have specific signature and audit consequences. The state machine is enforced at the **API layer**; UI affordances are derived from the state, never the inverse.

| State | Who's editing | What's locked | Notes |
|---|---|---|---|
| **Draft** | Author | Type 2 fields locked by Reviewer (if any) remain locked even in Draft after a send-back | Author edits freely; Reviewer can navigate but cannot comment; Approver can navigate but cannot decide |
| **In Review** | (no editing) | All Author content locked; Reviewer comments and locks fields | Author cannot edit; Reviewer reviews and decides |
| **Awaiting Approval** | (no editing) | All content locked; Reviewer's review is complete | Approver makes final decision |
| **Approved** | (no editing on Sections 1–6, 8, 9) | Permanently locked; Section 7 mitigation Status and progress notes are editable by Mitigation Owners only | Versions are frozen at this point. New edits require a new Version. |

### 5.2 State transitions

| Transition | Triggered by | Comment | Signature effect | Recipient banner |
|---|---|---|---|---|
| **Draft → In Review** | Author submits | n/a | Author signature stamped with submission date | n/a |
| **In Review → Awaiting Approval** | Reviewer marks complete | Optional Reviewer note | Reviewer signature stamped | n/a |
| **In Review → Draft** | Reviewer sends back to Author | Required reason | Author and Reviewer signatures cleared. Reviewer state resets to "not-opened" | Author sees **amber** banner with Reviewer's reason |
| **Awaiting Approval → Approved** | Approver approves | Optional Approver note (flows into exported document) | Approver signature stamped | n/a |
| **Awaiting Approval → In Review** | Approver sends back to Reviewer | Required reason | Reviewer signature cleared (Author signature retained) | Reviewer sees **amber** banner with Approver's reason |
| **Awaiting Approval → Draft** | Approver rejects | Required reason | All three signatures cleared. Reviewer state resets to "not-opened" | Author sees **red** banner with Approver's reason |
| **Approved → terminal** | n/a | n/a | Locked. New edits to Section 7 mitigation status governed separately | n/a |

**Audit log per transition:** every transition writes an audit entry capturing timestamp, user, role under which the action was taken, action type, comment text (if any), and recipient role. Immutable.

### 5.3 Pre-state advance navigation (sub-flows)

- **Reviewer in Draft state**: can navigate the Assessment freely. Sees a banner: "This assessment is still in Draft. You're viewing in advance — you cannot comment or take review actions until the Author submits." Comment affordances are NOT rendered; action panel is NOT rendered. Server-side: any attempt to POST a comment or call review-action endpoints returns **403** with reason "Assessment not in In Review state."

- **Approver in Draft or In Review state**: can navigate freely. Sees a banner: "You will review and decide on this assessment after the Reviewer marks it complete. Read-only until then." Decision panel is NOT rendered. Server-side: any attempt to call Approve / Send back / Reject endpoints returns **403** with reason "Assessment not in Awaiting Approval state."

### 5.4 Send-back / reject receipt banner

- On opening any section of the assessment, a receipt banner appears at the top of the section content (above the role banner).
- Banner shows: origin role (Reviewer or Approver), sender name, date, **full reason text**.
- Visual treatment: **amber** for send-backs, **red** for rejection.
- Banner persists across navigation within the assessment.
- Banner clears when the recipient takes their next workflow action (Author resubmits, Reviewer marks complete or sends back again).
- **Banner is tied to the assessment, NOT the user.** If the recipient hands off (e.g. Author reassignment), the new recipient sees the same banner. Implementation: banner state stored on the assessment record, not as user-level notification state.

### 5.5 Lead Author reassignment

**Pre-condition:** Assessment exists in Draft, In Review, or post-rejection Draft state (NOT Approved). Current Lead Author is a platform user with Author rights at the relevant facility. Intended new Lead Author is also a platform user with Author rights at that facility.

**Flow:**
1. From the Assessment view, current Lead Author or an Admin opens the Document Approvals panel. A "Reassign Lead Author" action is visible (Admins always; Lead Authors for their own assessments).
2. Modal: dropdown of Authors at this facility (excluding the current Lead Author), optional reason field (free text, up to 500 chars), confirm button.
3. On confirm:
   - The Assessment's `lead_author_user_id` is updated.
   - Audit log writes: timestamp, action, previous Lead Author user_id, new Lead Author user_id, reason.
   - The new Lead Author receives an in-platform notification.
   - Document Approvals front-matter updates to show the new Lead Author.
4. On approval, the export Document Approvals shows the **Lead Author at approval time** (current at approval), not the original Lead Author. Intermediate handovers are visible only in the audit log.

**Reassignment back:** When the original Lead Author returns, the same workflow runs in reverse. Each reassignment writes its own audit entry; full handover history is preserved. There is no limit on the number of reassignments.

**Why reassignment, not co-authoring:** Single accountability — exactly one platform user owns content at any moment. Cleaner audit trail. Document Approvals stays clean (one Lead Author signature per approved version). Avoids merge-conflict logic.

**Defensive validation:** Reassignment must check that the target currently holds Author rights at this facility. Right revocation between assignment and reassignment is rare but possible.

### 5.6 Withdraw / recall

> `TODO:` The User Flows references a Withdraw/Recall modal (component `WithdrawModal` exists in the JSX with `mode: 'withdraw' | 'recall'`) but does not specify the full semantics. Inferred from JSX:
> - **Withdraw**: Author recalls a submitted Assessment back to Draft from In Review (before the Reviewer has acted).
> - **Recall**: Author recalls an Assessment from Awaiting Approval back to Draft (before the Approver has acted)? OR Reviewer recalls their "review complete" decision back to In Review?
>
> Expected behaviour: requires a reason; clears any signatures stamped after the Author's; audit-logged. Confirm exact semantics, who can do which, and signature-clearing rules. The JSX has both modes wired up; check the component for the demo's behaviour and confirm it should match in production.

### 5.7 Consultant-to-operator handover

This is an operational handover that happens at the end of a consulting engagement when platform ownership transitions from the consultant (Alora) to the operator's team.

**Pre-condition:** The facility has been used to deliver one or more SRA cycles during the consulting engagement. The operator's own staff have been added as users with appropriate roles. Configuration (matrix, threats, libraries, notification triggers, default teams, mitigation owner pool) has been finalised.

**Flow:**
1. Consultant Admin reviews facility configuration with operator stakeholders to confirm setup.
2. Consultant Admin assigns the Admin role to one or more operator-side users.
3. Consultant Admin updates the facility context strip on the Admin Overview to reflect "handover complete" status.
4. Optionally, the consultant Admin retains a cross-facility Admin role for support purposes (configurable per engagement; this is the consultant's persistent platform-partner relationship).
5. Operator-side Admin can now make changes to configuration, users, libraries. Audit log captures the handover event.

**Implementation notes:**
- The handover is **procedural**, not technical. There is no special "handover" database operation; it is a sequence of role assignments and a status flag update.
- If the consultant retains cross-facility Admin access, this is implemented as a separate cross-facility role flag, not as a special user type.
- The "handover complete" status flag on the facility is mainly for visibility, not enforcement.

---

## 6. The 9 SRA sections (per-section behaviour)

The platform reproduces the standard 9-section SRA template, but with **interlinked structured data** so analysts do not re-type and ratings stay consistent. Sections 3 and 4 are master lists; Sections 5, 6, 7 derive from them.

**Common behaviours across all sections:**
- Each section has a completion status (pending / active / complete) reflected in the left-rail navigation.
- Author can move freely between sections.
- Every save writes an audit entry.
- Field-level edit history is visible inline (small history icon next to fields with edits) within Draft state for Authors and within In Review for Reviewers.
- Required-field validation runs on submission; errors list missing items with deep links.

### 6.1 Section 1 — Executive Summary

- Free-text rich-text field, one continuous narrative.
- Typically drafted by Author **at the end** based on everything captured in Sections 2–7.
- **AI drafting available** when the Drafted Summary feature is enabled (see §9.1). Author clicks "Generate Draft" → AI returns 3–5 paragraphs based on structured data → Author edits in place → original AI text retained in audit log alongside the edited final text.
- Save triggers audit entry; AI usage logged separately.

### 6.2 Section 2 — Facility / Asset Information

Structured metadata about the facility. Fixed fields:
- Name (free text)
- Country / Region
- Location (address, geolocation coordinates)
- Nature of Operation (e.g., "Oil and Gas Operations")
- Asset / Facility Type (e.g., "Refinery", "Terminal", "FPSO", "Depot")
- Accountable Business Manager (name)
- Regulated Asset (Yes / No)
- Regulatory Authority (e.g., "ISPS Code")
- General Information (free text — full description of the asset, nature of operations, complexities, materiality, other relevant details)

> `QUESTION:` Should Section 2 fields be free-text only, or should some have controlled vocabularies (e.g., Asset/Facility Type as a dropdown)? Recommend a configurable enum with "Other (specify)" fallback. Confirm.

### 6.3 Section 3 — Asset Disaggregation (master list)

**Purpose:** Single source of truth for the facility's components. Once entered here, assets do not need re-typing anywhere else.

**Per-Asset fields:**
- **Name** (required)
- **Description and Function** — what the asset does and its role in operations
- **Dependencies / Interdependencies** — multi-select from other Assets in the same Assessment, plus free text for external dependencies (e.g., "External grid")
- **Consequences** — free text (outcome of failure: injury, litigation, environmental damage, reputational damage, loss of revenue, etc.)
- **Asset Criticality** — enum: `Low | Medium | High | Very High` (configurable label set; default 4 levels)

> `TODO:` The JSX demo includes an additional **Type** field per Asset (e.g. "Process Unit", "Storage Tank Farm", "Control Room", "Marine Loading Terminal", "Administration Building", "Utility Substation", "Fuel Loading Skid"). This field is **NOT in the SRA template** but appears in the demo's Section 3 table. Decide whether to keep Type as a v1 field — useful for filtering/analytics and grouping in Section 5, but it would deviate from the contractual SRA template format unless we also extend the export to include it. Recommended: include Type as an internal-only field (visible in the platform UI but **not** rendered in the standard SRA export to keep the export template-faithful), with an option to enable it in custom exports later.

**UI behaviour:**
- Rendered as a list view; CRUD inline (add row, edit inline, delete with cascade warning if referenced downstream in Section 5/6, reorder).
- Library suggestion: when typing a new Asset name or description, semantic search against the Scenarios / Vulnerabilities / Consequences libraries surfaces relevant pre-written content.
- Anomaly check (if enabled): flags inconsistencies like Low criticality combined with severe described consequences (fatality, major environmental release).

### 6.4 Section 4 — Threat Assessment (master list)

**Purpose:** Single source of truth for threats relevant to the facility. The default list of 8 categories ships as starting configuration but is **not hardcoded** — Admin can add, edit, or remove categories per facility.

**Default 8 threat classifications:**
1. Organised Crime
2. Criminality
3. Civil / Community Unrest
4. Armed Conflicts
5. Terrorism
6. Cybercrime & Data Breaches
7. Insider
8. Maritime

**Per-threat fields:**
- **Threat Classification** — name (configurable per facility; admin-managed)
- **General Threat History** — free text (high-level definition / industry context)
- **Facility-Specific Threat History** — free text
- **Threat Capability & Intent** — free text
- **Threat Rating** — enum: `Low | Medium | High | Very High` (configurable label set)

**UI behaviour:**
- Rendered as a table; rows are threats. Order matches the configured order.
- Editing one threat does not affect Section 5 or 6 except by automatic propagation (rating shows in Section 6 evaluations as part of the Asset × Threat context).

### 6.5 Section 5 — Asset Attractiveness (cross-reference matrix, auto-derived)

**Purpose:** A pivot grid showing which Threats apply to which Assets.

**UI behaviour:**
- Rows: Assets from Section 3.
- Columns: Threats from Section 4.
- Cells: ticked / unticked boolean. Author ticks to indicate this Threat applies to this Asset.
- New Assets in Section 3 → row appears automatically.
- New Threats in Section 4 → column appears automatically.
- Asset deletion in Section 3 → row disappears with confirmation prompt (cascades to Section 6 evaluations referencing that Asset).
- Threat deletion in Section 4 → column disappears similarly.

**Performance constraint:** Pivot grid must render under 3 seconds for up to 50 Assets × 8 Threats. Use virtualization for larger grids.

> `TODO:` The User Flows says Section 5 is "the hardest UI in the build" — virtualization, real-time row/column updates from Sections 3 and 4, and visual feedback for derived cells are non-trivial. Build plan should allocate appropriate time. Note: this section's name in the SRA template is "Asset Attractiveness" but the User Flows calls it "Cross-Reference Matrix" — both refer to the same UI. Use both in the UI label for clarity (e.g., "Section 5: Asset Attractiveness Cross-Reference").

### 6.6 Section 6 — Vulnerability Assessment & Risk Treatment (where the analysis happens)

**Purpose:** For each meaningful Asset × Threat combination ticked in Section 5, the Author creates an **Evaluation** capturing the analytical work.

**Per-Evaluation fields:**
- **Asset** — references Section 3 (read-only; chosen at evaluation creation)
- **Threat Classification** — references Section 4 (read-only; chosen at evaluation creation)
- **Risk Scenario** — free text describing the scenario (e.g., "Theft of materials from facility yard by external actor")
- **Consequences of Risk Scenario** — free text
- **Existing Mitigation / Existing Controls** — free text
- **Vulnerabilities** — free text
- **Pre-mitigation Risk Rating (R1)** — calculated:
  - User selects Consequence severity 0–5 (per axis)
  - User selects Likelihood 1–5
  - System looks up the cell in the configurable 5×5 matrix → returns a Risk Rating with band (Low / Medium / High / Very High) and numeric score
- **Proposed Mitigation** — free text or selected from Mitigations library
- **Post-mitigation Risk Rating (R2)** — calculated the same way; demonstrates risk reduction expected after mitigation

**R1 / R2 calculation rules (default 5×5 matrix):**
- Score = Consequence × Likelihood. When both are non-zero, score is in **range 1–25**.
- **Special case:** if Consequence = 0 ("No effect"), no rating is computed (the result is null/blank). The user can still save the Evaluation but the R1/R2 chip will display as "—" until both inputs are non-zero.
- Band thresholds (default): Low ≤ 4, Medium 5–9, High 10–15, Very High 16–25
- All thresholds and the matrix itself are **configurable per facility** by Admin. Approved assessments freeze the matrix in force at approval.

**UI behaviour:**
- Rendered as a table; each row = one Evaluation. Click a row to open the detail editor.
- Detail editor shows the Asset/Threat context, all editable fields, R1/R2 chips with heatmap colours, and a mini-matrix visualization.
- Comments (Reviewer only, In Review state) attach to fields.
- Evaluations are created from Section 5 (clicking a ticked Asset × Threat cell prompts "Create evaluation"); the data model creates one Evaluation per Asset × Threat ticked cell.

**Anomaly check (if enabled):** flags cases like R1 inconsistent with severity × likelihood inputs, scenarios that do not match the chosen threat type, severity ratings inconsistent with asset criticality, mitigations that don't address the stated vulnerabilities. Inline warning chip with one-click acknowledge picker (Not applicable / False positive / Will address / Other). See §9.2.

### 6.7 Section 7 — Proposed Mitigation (auto-populated, then tracked over time)

**Purpose:** Every Proposed Mitigation from Section 6 flows here as a tracked action item. **Two-phase lifecycle**: pre-approval (Author edits) and post-approval (Mitigation Owner edits via My Mitigations dashboard).

**Per-Mitigation fields (pre-approval — Author edits, locks at approval):**
- **Mitigation description** — auto-populated from the parent Evaluation's Proposed Mitigation field; Author can refine.
- **Severity** — auto-derived from the parent Evaluation's R1 risk rating; Author cannot override. Read-only.
- **Agreed (Action)** — enum: `Yes | No | Pending`. Set by the Author to record management's decision from the SRA workshop.
- **Owner (Responsible Party)** — assigned by the Author from the Mitigation Owner Pool dropdown (role labels like "Security Manager") **AND/OR** specific named users. The role-label model is preferred because the role-holder may change over time but role responsibility persists.
- **Target date** — set by the Author. Reflects agreed operational commitment.
- **Comment / Interim Mitigation / Reason for Non-Agreement** — free text. Particularly used when Agreed = No to record why.

**Per-Mitigation fields (post-approval — Mitigation Owner edits via My Mitigations):**
- **Status** — enum: `Open | In Progress | Done`. Mitigation Owner moves through these states.
- **Progress notes** — append-only log. Each save creates a new entry; existing entries are never overwritten.

**Status transition rules:**
- `Open → In Progress`: progress note **optional**.
- `In Progress → Done`: progress note **REQUIRED** (server returns 400 if note empty/whitespace-only).
- `Done` is **terminal**. Reverting requires a new assessment cycle (Author authority).
- Cancellation is **not** a status — cancellation is the Author's authority during a new cycle. Mitigation Owner can flag intent to cancel via a progress note; Author and Approver decide in the next cycle.

**Visibility of progress notes:**
- Inline preview of the latest entry on each Mitigation row in Section 7 (read-only for Author / Reviewer / Approver / HQ Executive / Admin).
- "Show full log (N entries)" button expands the log inline as a nested table row beneath the Mitigation row, showing every entry newest first with timestamp, author display name, author role label, text, and status badge if the entry was a transition.
- Multiple mitigations can be expanded simultaneously. Expanded state is per-user-per-session (not persisted across sign-ins).
- The Mitigation Owner edits via My Mitigations dashboard, **never via Section 7**.

**Overdue notification:** when target date passes and status is not Done, an email notification fires to the assigned Mitigation Owner (per notification trigger configuration; default trigger: "mitigation overdue"). The Mitigation Owner sees an overdue indicator on their dashboard.

### 6.8 Section 8 — Conclusion

- Free-text rich-text narrative.
- AI drafting available when the Drafted Summary feature is enabled (same flow as Section 1 — see §9.1).
- Save triggers audit entry; AI usage logged.

### 6.9 Section 9 — Appendices

Three sub-tables, all editable by Author:

#### 9.A — SRA Team Members (Document Approvals + Contributors)

Two parts:

**(i) Document Approvals row (the front-matter signatures):**
- Three rows: Author, Reviewer, Approver (+ optional dual-role acknowledgement marker).
- **Pre-populated from facility configuration's Default Assessment Teams** at Assessment creation.
- Per-assessment override is supported (Author can change the assigned team for that specific assessment without affecting the default).
- Lead Author row is highlighted with a lock icon (only reassignable via §5.5 reassignment workflow, NOT inline-editable here).
- Names and signature timestamps populate automatically from the audit log (signature events at submission, review-complete, approval).
- The Document Approvals table appears on the Word and PDF export front matter populated from this configuration plus actual sign-off timestamps from the audit log.

**(ii) Contributors (non-platform-user team members):**
- Editable rows: Team Member Type (e.g., "Team Lead", "Core", "Part Time", "Security Consultant"), Full Name, Position, Area of Expertise, Company / Function.
- **Contributors are NOT platform users.** They have no logins, no edit rights, no workflow obligations, no audit-log identity.
- **Contributor directory autocomplete:** As Author types a name, the system queries the contributor directory across the operator's facility portfolio and returns ranked suggestions (this facility first, then other facilities; most recent first; top 10).
- Picking an existing entry auto-fills name, position, expertise, company. Author can edit auto-filled fields if a person's role/company has changed; edits stored only on this assessment (do not propagate back to historical assessments).
- "Add new contributor (not in directory)" creates a fully blank row.
- Contributor rows are removable via row-level delete (cannot remove the Lead Author row from here; that requires §5.5 reassignment).

**Data model rule:** Contributors are stored as **embedded records on each Assessment**, NOT as foreign-key references to a separate contributors table. This preserves historical accuracy across cycles. The "directory" is a derived view at query time. There is **no separate CRUD interface** for editing or deleting contributors. Privacy by minimisation: the directory is never displayed as a browsable list.

**Cloning (§6.10):** Cloning a previous year's Assessment carries forward the full team list as a starting point.

#### 9.B — References

- Editable rows: Description, Attachment / Link.
- Attachment can be a file upload (facility schematic, prior SRA reports, incident records, photos, technical security equipment specs, etc.) or a URL.

> `QUESTION:` Where do uploaded files (schematics, photos) live and how big can they be? Need storage policy: max file size per attachment, total quota per assessment, allowed MIME types, retention. Recommend defaults: 50 MB per file, no quota at assessment level, common image / document MIME types only (PDF, PNG, JPG, DOCX, XLSX). Confirm.

#### 9.C — Risk Assessment Matrix appendix

- Read-only display of the configured 5×5 matrix in force for this assessment.
- For approved Assessments: shows the snapshot of the matrix at the time of approval (frozen Configuration), not the current configuration.
- Visual: 5×5 grid with Likelihood across the top, Consequence severity (0–5) down the side, with the four consequence axes (People, Assets, Environment, Reputation by default) shown for each severity level.
- Cells coloured by risk band.

### 6.10 Cloning a previous year's Assessment

**When:** Author starts a new Assessment and chooses "Clone last year's assessment" instead of "Start blank."

**What gets copied:**
- All structured data from Sections 1–9 of the source Assessment.
- Assets (Section 3) with Dependencies relationships.
- Threats (Section 4) with full ratings.
- Section 5 cross-reference cells.
- Evaluations (Section 6) with full content and ratings.
- Section 7 mitigation rows (with **status reset** — see below).
- Section 9 contributor list (carries forward as starting point; Author edits as needed).
- References (links and attachment metadata; actual file copies vs links is `TODO:`).

**What gets reset:**
- Assessment state → Draft.
- Assessment ID → new (new database record).
- Signatures → cleared.
- Audit log → fresh (new audit log per Assessment, but the source Assessment's audit log is referenced as "cloned from" lineage).
- Section 7 mitigation Status → reset to Open (or `TODO:` confirm — should completed mitigations retain their Done status as historical context, or be reset to Open for the new cycle? Recommend: clone with Status = Open and a note indicating "Cloned from prior cycle; previous status: Done" for traceability).
- Section 7 progress logs → not carried forward (the new cycle starts fresh).

**Implementation note:** Cloning logic is non-trivial because it must deep-copy a relational structure (Assessment → Items → Evaluations → Mitigations) while reassigning IDs and preserving Asset-to-Asset Dependency references within the new Assessment.

> `TODO:` Confirm clone semantics for: (a) Section 7 mitigation status (reset vs preserve), (b) Section 9 references — do file attachments duplicate or share references, (c) what happens if the configured matrix or threat list has changed between cycles — does the cloned assessment use the new config or attempt to preserve the old? Recommend: cloned assessments use the **current** configuration (Author may need to re-rate if scales changed), with a banner explaining the configuration may have changed since last cycle.

---

## 7. Section 7 mitigation tracking & Mitigation Owner workflow

This is documented in §6.7 (the Section 7 view) and §3.1 Mitigation Owner role. This section covers the **Mitigation Owner's dedicated workflow** — the My Mitigations dashboard and detail panel — in detail.

### 7.1 Mitigation Owner sign-in

- User signs in via the standard sign-in flow. MFA challenge per facility configuration (default: optional for Mitigation Owner).
- On successful sign-in, if Mitigation Owner is the user's only role (or the role they were last in), they land **directly on the My Mitigations dashboard** — not on a generic dashboard, not on an assessments list, not on a hub menu.
- Navigation chrome for a Mitigation Owner shows: "My Mitigations" link (active), profile menu, sign-out. **NO link to Sections 1–9, NO link to Configuration, NO link to other dashboards.** These nav items are **not rendered** (not greyed out — absent).
- If the user holds multiple roles, the role switcher appears as documented in §3.2.

### 7.2 My Mitigations dashboard

**Header:**
- Page title and brief description.
- Mitigation Owner identity pill at top right (the user's display name).

**KPI cards (4):**
1. **Open** — count of mitigations in Open status assigned to this user across all facilities, filtered to Approved-state assessments.
2. **In Progress** — count of mitigations in In Progress status.
3. **Overdue** — count of mitigations whose target date has passed AND status is not Done.
4. **Done this year** (or current cycle) — count of mitigations marked Done.

**Pending Assignments banner (conditional):**
Appears at the top of the dashboard **only when** the user has been proposed as Owner on a mitigation in an assessment that is **not yet Approved**. Banner copy: "You've been proposed as Owner on N mitigations in assessments that are not yet approved. These are read-only until approval."

**Assigned-to-me table:**
One row per assigned mitigation. Columns:
- Mitigation description
- Asset and Threat source (e.g., "Asset 1 × Criminality")
- Last update timestamp
- Log entry count
- Facility / Cycle (e.g., "Operator A — Lagos Refinery / 2026 SRA")
- Severity (R1 band: Low / Medium / High / Very High)
- Target date (with overdue indicator)
- Status pill (Open / In Progress / Done; colour-coded)
- Assessment state pill (Approved / Awaiting Approval / In Review / Draft)
- Action button: **"Update"** for Approved-state mitigations, **"View"** for non-Approved mitigations.

**Cross-facility scope:** A Mitigation Owner who holds the same role label across multiple facilities sees mitigations from all those facilities in one view. Facility name shown prominently per row.

**Footer info note:** "You can update Status and add progress notes only on mitigations in approved assessments. You cannot edit Mitigation, Severity, Agreed, Owner, or Target fields. To revise those, the assessment Author must run a new cycle."

**Server-side scope filter:** The dashboard fetches from `/api/mitigations/mine` which filters server-side:
```sql
WHERE owner_user_id = current_user.id
   OR owner_role_label IN (current_user.held_role_labels)
```
Client-side filtering is NOT trusted. A Mitigation Owner cannot, even by crafting a URL, retrieve another Mitigation Owner's mitigations.

### 7.3 Mitigation detail panel

Clicking "Update" or "View" opens a **full-screen detail panel** (not a modal).

**Header card:**
- Mitigation description (full text)
- Severity, Facility / Cycle, Target date with overdue indicator
- Assigned by name and date
- Current status

**Update panel (Approved state only — "Update" entry point):**
- Status dropdown: Open / In Progress / Done
- Progress note textarea (label and required-state are **contextual** to the chosen Status):
  - If Status unchanged: textarea optional; Save button labelled "Add note."
  - If Status changing to In Progress: textarea optional; Save button labelled "Update status."
  - If Status changing to Done: textarea **REQUIRED** (form prevents submit if empty); Save button labelled "Mark as Done."
- Reset button to discard draft changes.

**API endpoint:** `POST /api/mitigations/:id/log` validates:
- Assessment is Approved
- Requesting user is the assigned Mitigation Owner (via `user_id` OR via held role label)
- Status transition is allowed (Done is terminal)
- Note required when transitioning to Done (rejects with 400 if missing)

On success:
- New log entry appended with: timestamp, user_id, display name, role label, text, optional `statusChange = { from: X, to: Y }`.
- Audit log writes a separate immutable entry (the progress log is operational; the audit log is governance — both exist, both serve different purposes).
- Toast confirms; dashboard status pill updates; KPI cards recalculate.
- On Done transition: a green Done banner appears in the detail panel: "This mitigation is marked Done. The progress log is preserved as a permanent historical record. To re-open, contact the assessment Author."
- Cross-role notification: assessment's Author and Approver receive an in-platform notification ("[Mitigation Owner name] marked [mitigation] as Done"). No action required on their part.

**Read-only mode (non-Approved state — "View" entry point):**
- Blue read-only banner: "This mitigation is part of an assessment in [State]. You'll be able to update Status and add progress notes once the assessment is approved."
- Header card renders the mitigation context as documented. **No Update panel rendered. No edit affordances visible.**
- Progress log section is empty (no log entries can exist before approval) but the section heading is still shown so the user understands where progress will go once active.
- Server-side: any attempt to call `PATCH /api/mitigations/:id/status` or `POST /api/mitigations/:id/log` on a non-Approved mitigation returns **409 Conflict** with reason "Assessment must be Approved before mitigation status can be updated."

### 7.4 Pool role-holder change behaviour

Documented in §3.1 (Mitigation Owner role). Summary:
- Admin updates Pool mapping → all open mitigations transfer automatically to new holder.
- Previous holder loses access; new holder gets in-platform notification.
- Progress log entries from previous holder preserved with original attribution.
- Audit log records the Pool mapping change.
- Inherited mitigations flagged "Recently inherited" on new holder's dashboard for 30 days.

---

## 8. Field mode (PWA, per-section checkout, offline auth)

Field mode enables genuine **offline editing of assessments** while analysts work at offshore platforms, remote terminals, portacabins at site, and other low-connectivity locations. The chosen architecture is **per-section checkout**, not optimistic merge or single-author lock.

> **Important framing:** Field mode is **device-agnostic**, NOT mobile-only. SRA fieldwork frequently involves analysts working on **laptops in portacabins or meeting rooms at site**, away from reliable internet. The Progressive Web App (PWA) architecture supports all device classes natively: Chrome and Edge install as desktop apps (Windows, macOS); iOS Safari and Android Chrome install as mobile apps. **The dev brief, design brief, and any client-facing language must NOT frame Field mode as mobile-first only.** All device classes are first-class targets.

### 8.1 Build scope

> `TODO:` There is a **discrepancy** between source documents:
> - **User Flows §Workflow 21 says Field mode is "Core build scope"** (per-section checkout AND offline authentication, both ship in the main build).
> - **Platform Overview says Field mode "is part of the main build."**
> - **The demo JSX (`FieldModeModal`) labels it "Phase 3."**
>
> This is most likely a stale label on the demo (the demo predates the spec update). **Recommended resolution: Field mode is in the main build, both per-section checkout and offline authentication.** Update the demo's "Phase 3" label and the design brief if it mirrors the demo. Confirm before development.

### 8.2 Per-section checkout architecture

Per-section checkout was chosen deliberately over fancier real-time-merge approaches because **reliability and audit-defensibility matter more than maximum flexibility for SRA work.** Framing: "reliable over fancy."

**How it works:**

1. **Take offline with scope.** Before leaving for site, the analyst declares which sections (or specific Evaluation records) they will work on. Example: "I am taking the Cyber and Insider evaluations offline." Only those records check out to their device. Other records remain available to teammates online or to other field workers taking different (non-overlapping) scope.

2. **Work offline on what was checked out.** Edit Evaluations, attach photos, update mitigation status. Records the analyst did not check out remain **read-only** on their device. Multiple field workers can hold different non-overlapping scopes in parallel.

3. **Sync on return.** Back in coverage, tap "Sync." Changes upload cleanly with **no conflicts possible** because no other user could touch the records the analyst held. The audit log captures the field-edit window with **original timestamps** (when the edit actually happened on the device, not when it synced).

**Why per-section checkout, not optimistic merge:**
- Matches how SRA fieldwork actually divides — specialists work by domain (cyber, marine, operations, insider), not by asset.
- No silent data loss possible. Sync is always clean.
- Predictable user experience: other users see clear "checked out by X, last seen offline 14:32" indicators rather than confusing conflict-resolution screens.
- Audit-defensible: every edit timestamps when it happened, not when it synced.
- Modest engineering effort vs full optimistic merge.

**Trade-off acknowledged:** Analysts must declare scope before going offline. This is workflow overhead, but it matches real planning behaviour ("I will do the cyber evals, you take the maritime ones") and is the kind of inconvenience experienced field workers prefer because it makes the system predictable.

**Implementation requirements:**
- **Record-level locks during offline window.** When a record is checked out, a lock flag with `user_id` and `checkout_timestamp` is set on the record server-side. Online users see the lock indicator and cannot edit until the field user syncs and releases the lock.
- **Sync preserves original edit timestamps** for audit trail. Add an explicit `edit_at` field separate from `synced_at`.
- **Photo capture and queueing.** Photos taken offline are queued locally with the record. Sync uploads the photos, attaches them to the record, releases the lock.
- **Installable PWA covering BOTH desktop AND mobile.** Cache manifest covers checked-out records, libraries, and reference photos.
- **Scope-based checkout endpoints:** API for declaring scope, listing checked-out records, releasing locks.
- **"Checked out by" indicators across the UI:** every record list, every detail view shows lock state and field user.

### 8.3 Offline authentication (pre-authorise + PIN/biometric)

When a user opens the app offline, the platform cannot phone home to verify their password. Naïve solutions (cache the password, skip auth, bypass security) all fail audit. The chosen architecture is **pre-authorise + PIN/biometric**.

**Pre-authorise online (before going to site):**
1. During an online session, user navigates to **Settings → Offline Access**.
2. System shows a "Pre-authorise offline use" flow with three inputs:
   - **Offline window:** 1, 3, 5, or 7 days (facility Admin can set the maximum).
   - **Authentication method:** PIN or biometric (Face ID, Touch ID, Windows Hello).
   - **Confirmation.**
3. **If PIN selected:** user enters a PIN of configurable length (default 6 digits, facility Admin can set min 4–8). System hashes the PIN locally and stores **only the hash on-device, never the raw PIN**.
4. **If biometric selected:** system invokes the platform's secure enclave (iOS Keychain, Android Keystore, Windows Hello, macOS Keychain) to bind the offline session to the device's biometric. **No biometric data leaves the device.**
5. System creates an **offline session token bound to the device fingerprint**, valid for the chosen window. Token is signed by the server and stored locally.
6. System shows confirmation: "Offline access pre-authorised until [date/time]. Use your [PIN / Face ID / Touch ID] to sign in offline within this window."

**Open the app offline (PIN/biometric sign-in):**
1. User opens the app offline. App detects no connectivity.
2. App shows **Offline Sign-In** screen: user identifier (email or username — NOT password) and PIN/biometric prompt.
3. User enters PIN or completes biometric. System verifies against local hash / secure enclave.
4. **On success:** offline session resumes. User can access checked-out records and edit per §8.2. App banner indicates "Offline mode" throughout.
5. **On failure:** failure counter increments. Counter is stored locally with tamper-resistance (signed by server during pre-authorise).

**Failed-attempt protection:**
- After a configurable threshold of failed PIN attempts (**default 5; facility Admin can set 3–10**), the device **wipes its offline cache**.
- Cache wipe removes: checked-out records, queued photos, queued audit log entries, offline session token, PIN hash.
- After cache wipe, user is **locked out** until they reconnect online and re-authenticate with full password + MFA per their role policy.
- Cache wipe event is logged locally and **pushed to the central audit log when the device next reconnects** (a special audit entry type).

**Window expiry:**
- Outside the pre-authorised window, the offline session token is **rejected** even if PIN/biometric is correct.
- User sees a clear "Offline window expired. Please reconnect to continue." message.
- **Sync queue (any pending offline edits, photos, audit entries) is preserved through the lockout** — no data loss.
- On reconnection, user authenticates online with full password + MFA, sync proceeds, queued data uploads.

**Audit trail:**
- Every offline sign-in attempt (success or failure) logged locally with timestamp, device fingerprint, PIN/biometric outcome, result.
- On sync, all offline auth events pushed to the central audit log as their own audit entry type.
- Cache wipe events, window expiries, pre-authorise events all logged.

**Critical implementation rules:**
- **Never cache the user's full password on-device.** Only the PIN hash (Argon2 or bcrypt) and the offline session token (server-signed).
- **Bind the offline session token to a device fingerprint.** A token created on Device A must not be usable on Device B even if local storage is exfiltrated.
- **Biometric integration uses platform native APIs only** (Web Authentication API for browser PWAs, native bindings for installed PWAs). Never roll your own biometric handling.
- **PIN hash storage uses platform-encrypted local storage** (IndexedDB with encryption layer, or platform secure storage if available).
- **Failed-attempt counter must be tamper-resistant.** Sign the counter with a server-issued key during pre-authorise so attackers can't reset it locally.
- **On cache wipe, securely overwrite the local storage**, not just clear references. The audit trail and queued sync data must be preserved through the wipe and pushed on reconnection.
- **Offline window enforcement is server-driven:** the server signs the window into the token. Client-side date/time manipulation cannot extend the window.

**Facility Admin configurability:**
- Maximum offline window (1–7 days)
- Minimum PIN length (4–8 digits)
- Failed-attempt threshold (3–10)
- Biometric availability (allowed / not allowed)

These settings live in the same Admin Configuration surface (under MFA / Authentication policies — see §13).

**Per-role MFA policies and offline auth are independent.** A user whose role requires MFA online still requires their PIN/biometric offline; the role policy doesn't override the offline auth requirement.

### 8.4 Graceful offline read-only fallback (separate from Field mode)

The build also includes a **basic offline experience** that prevents the worst UX failure modes when connectivity drops outside Field mode. This is **NOT** full offline editing — it's a graceful degradation that complements Field mode for users not in active offline sessions.

**Trigger:** User has an active session; connectivity drops mid-session (intermittent network, mobile coverage loss, etc.).

**Behaviour:**
- Platform detects connectivity loss (failed API request, websocket disconnect, `navigator.onLine` event).
- UI displays a clear, persistent "You're offline. Changes will not save until you reconnect" indicator at the top of the page.
- All form fields become **read-only**. User cannot type into editable fields.
- Last cached state of the assessment remains visible; user can still navigate, read, review.
- On reconnection, indicator clears, fields become editable again, normal save behaviour resumes.

**Implementation notes:**
- The cached state shown when offline is the last state from the active session; no separate cache layer required for this fallback.
- **Do NOT attempt to queue changes for sync in this fallback flow.** Queueing and sync are handled by Field mode (§8.2), which uses per-section checkout for that purpose.

### 8.5 What stays online-only (NOT available offline)

- HQ Executive dashboards
- Cross-facility comparisons
- Approval workflow actions (submit, mark complete, approve, reject)
- AI-drafted summaries and AI features generally

### 8.6 Field mode use cases (best-suited)

- Offshore platform site visits
- Remote terminal inspections
- Multi-day field assessments
- Laptop work in portacabin or meeting room at site
- Specialists working in parallel by domain (cyber expert, marine expert, operations expert)

---

## 9. AI features

Vantage has **six AI features** sitting on a shared **AI service module**. Three are base (included in build), two are paid recurring add-ons, one is bespoke (built only when commissioned).

> **Critical architectural rule:** **All AI features call through the AI service module. NONE call providers directly.** If a developer writes `import OpenAI` or `import Anthropic` anywhere in feature code, that is an architectural violation that must be caught in code review.

### 9.0 The AI service module (shared foundation)

**What it does:**
- Wraps Together AI's OpenAI-compatible chat-completion API as the primary inference provider, with a frontier API (Anthropic Claude or OpenAI GPT-4) configured as fallback in YAML config.
- Routes per-feature provider choice via config — individual features can be flipped from Llama to Claude/GPT-4 by editing one YAML file (e.g. `/config/ai-providers.yaml`) and restarting. **No code changes.**
- Logs every AI call to the platform's audit log: feature, facility, user, model version, input tokens, output tokens, dollar cost, latency, outcome (success / error / timeout / rate_limited / cost_ceiling_hit).
- Enforces **per-facility cost ceilings**: a soft ceiling (alert at 80% of monthly budget) and a hard ceiling (auto-suspend the feature for that facility when monthly budget hit; resume on the 1st of the next month).
- Enforces **per-facility scoping by construction**: a request originated at Facility A can never include Facility B's data in its prompt context.
- Retries with exponential backoff on transient provider failures.
- Rate-limits per facility to prevent runaway feature usage.

**What the module does NOT do (deliberate v1 scope):**
- **No entity tokenisation or obfuscation.** Vantage v1 sends real entity names to providers. Can be added later as paid hardening if a regulated customer requires it.
- **No multi-provider gateway with adapters.** Just Together AI primary plus frontier API fallback.
- **No prompt management UI.** Prompt templates live in version-controlled config files; updates go through normal code review.
- **No model fine-tuning.** Stock model checkpoints with prompt engineering only.

**Default budgets:**
- Per-facility per-feature soft ceiling: alert at 80% of monthly budget.
- Per-facility per-feature hard ceiling: auto-suspend at 100%.
- Default monthly budget per facility: **$50** (covers all features at typical usage with margin).
- Default monthly budget per operator (HQ-level features): **$20**.
- Budgets configurable per facility/operator at onboarding.

**Failure handling:**
- Provider timeout: retry once with exponential backoff. If still failing, return clear error to user ("AI service temporarily unavailable. Please try again in a few minutes.").
- Provider error: return clear error. **Do NOT silently fall back to another provider mid-request.** Audit log must reflect what was actually used.
- Cost ceiling hit: return soft error ("AI features for this facility are paused for the rest of the month due to usage limits. Contact your administrator."). **Do not block other platform features.**
- All failures logged with `trace_id` for root-cause analysis.

**Latency targets:**
- Drafted Summary: under 10 seconds (3–8s typical)
- Anomaly Detection: under 3 seconds (including 800ms debounce)
- Smart Tagging: under 2 seconds (runs async after save, does not block user)
- Semantic Search: under 500ms (embedding + cosine similarity in Postgres)
- Consistency Flagging: nightly batch, no user-facing latency requirement

### 9.1 Feature 1 — AI-drafted Executive Summary & Conclusion (BASE)

**What it does:** When an Author finishes Sections 2–7, they click "Generate Draft" on Section 1 (Executive Summary) and Section 8 (Conclusion). Llama 3.3 70B reads the structured data and returns 3–5 paragraphs the Author edits before submitting.

**User flow:**
- Author completes Sections 2 through 7.
- Author opens Section 1 or Section 8.
- Author clicks Generate Draft. Loading state appears (3–8 seconds typical).
- Vantage backend gathers structured data, sends to Together AI with the locked prompt template, receives draft, displays in edit panel marked "AI-generated, requires human review."
- Author edits in place. Word count visible. Token-cost indicator hidden by default but available in a small details disclosure.
- Author clicks Save or Save and Continue. Final text persists; **AI-generated original retained in audit log alongside the edited final** so Approver can compare.
- Author can regenerate (same input, retried) or generate a fresh draft after editing structured data.

**Permission gating:**
- Endpoint: `POST /api/assessments/:id/sections/:n/generate-draft` where `n ∈ {1, 8}`.
- Validates: acting role == Author **AND** assessment state != Approved.
- Generate Draft affordance rendered ONLY for users currently acting as Author on non-Approved assessments. Other roles: affordance hidden in UI **AND** endpoint returns 403 if called directly.

**Service:** Together AI / Llama 3.3 70B Instruct Turbo. Single chat completion call per draft request. ~2,000–4,000 input tokens; ~600–1,000 output tokens. ~$0.005 per draft. Latency 3–8s typical.

**Audit log** for every draft generation: feature, facility, user, role under which requested, model version, tokens in/out, cost, latency, outcome.

### 9.2 Feature 2 — Real-time anomaly detection (ADD-ON, recurring)

**What it does:** As an Author enters data in Sections 3 (Assets), 5 (Cross-Reference Matrix), and 6 (Vulnerability Evaluations), Vantage runs lightweight checks on save and surfaces inline warnings for likely errors:
- Rating math that does not add up (R1 inconsistent with severity × likelihood inputs)
- Scenarios that do not match the chosen threat type (e.g., a civil unrest scenario describing a pirate boarding)
- Severity ratings inconsistent with asset criticality (e.g., Massive consequence on a Low-criticality asset)
- Mitigations that don't address the stated vulnerabilities
- Asset criticality marked Low while consequences mention fatality or major environmental release

**User flow:**
- Author types/selects in Sections 3, 5, or 6.
- On save (debounced 800ms), backend rule engine runs. Hybrid: deterministic rules (server-side, no LLM) + LLM-based contextual checks via the AI service module.
- If a check flags the field, an inline warning chip appears next to it (warning icon, short text, acknowledge button).
- Author clicks Acknowledge → pre-canned reason picker: **Not applicable / False positive / Will address / Other** (free text if Other).
- Acknowledgement dismisses the warning for this Author for this assessment. **Other Authors editing the same record see the warning fresh.**
- Every flag and dismissal logged for tuning.

**Critical design constraints:**
- This feature **must NEVER block submission**. It is **advisory only**. Authors retain full agency.
- **False positives must be tuned aggressively low.** A noisy implementation trains Authors to ignore all warnings, destroying the value. Better to under-flag than over-flag.
- Steady-state goal: 10–20% dismissal rate. Higher → rules are noisy. Lower → not catching enough.

**Permission gating:** acting role == Author AND assessment state == Draft.

**Pricing:** $500–$1,500 USD per month per facility, depending on tier. Recurring fee covers rule curation work owned by the platform operator.

**Service:** Per LLM call: ~500 input tokens, ~100 output tokens, ~$0.0005 per call. Monthly cost per active facility: ~$10–30 in AI runtime.

### 9.3 Feature 3 — Cross-facility consistency flagging (ADD-ON, recurring)

**What it does:** A nightly batch job compares each facility's risk ratings against peer facilities (similar facility class, region, threat profile) within the same operator's portfolio. Statistical outliers — ratings that diverge 2+ standard deviations from peer norm on shared scenario patterns — are flagged.

For each flagged outlier, Vantage generates a **short prose rationale** (LLM-generated) visible on the HQ Executive dashboard explaining what factors might justify or question the divergence.

**User flow:**
- Nightly batch job runs after midnight UTC.
- System clusters scenarios across all facilities in an operator's portfolio (same threat type, similar asset class).
- For each cluster, computes peer mean and standard deviation of ratings.
- Facilities 2+ standard deviations from peer mean flagged as outliers.
- For each outlier, calls Together AI to generate a short prose rationale (e.g., "Maritime threat at Bonny Inland Depot rated Low while 16 of 18 peer facilities rated it High; rationale references diminishing pirate activity, but peer rationales reference recent escalation. Worth review.").
- Flag stored with severity, rationale, lifecycle status (pending / dismissed / sent-back / expired).
- HQ Executive sees flagged inconsistencies on dashboard with rationale and drill-into-facility link.
- HQ Executive can review, dismiss with reason, or send back to Author for re-assessment.

**Permission gating:** Nightly batch job runs as **system**, not as a user. The HQ Executive views the resulting flags; dashboard query validates HQ Executive role and operator-portfolio scope.

**Pricing:** $2,000 USD per month per operator, billed at HQ level. Flat fee regardless of facility count.

**Why this is HQ-level pricing:** Value scales with operator size — a consultant operating 1 facility gets nothing from cross-facility flagging; an operator with 20+ facilities gets meaningful network-effect value.

**Note on data sensitivity:** Facility rating data is not sensitive in itself, but the obfuscation layer (when implemented) still wraps the call as a matter of policy. v1 does not have obfuscation; data is sent in the clear to providers.

### 9.4 Feature 4 — Semantic library search (BASE)

**What it does:** When an Author is filling a field that pulls from one of the five enterprise libraries (Scenarios, Mitigations, Vulnerabilities, Controls, Consequences), the search box returns matches by **meaning**, not just keyword.

Examples:
- Typing "ship boarding" returns library entries about "vessel hijacking," "unauthorised vessel access," "piracy at sea" even though the words don't match.
- Typing "thieves cutting through perimeter fence" returns "unauthorised intrusion via fence breach," "perimeter compromise night incursion," "theft of materials from yard."

**User flow:**
- Author opens any Section that pulls from a library (most commonly Section 6 vulnerability and mitigation pickers).
- Types into search box.
- Backend generates an embedding of the query string via the AI service module.
- Backend runs similarity query against pre-computed embeddings stored in **pgvector**, filtered to the relevant library type and Author's facility scope.
- Results appear ranked by similarity (top 10 by default), with similarity score (small grey number next to each result).
- Author picks a match → selected library entry's content auto-fills the relevant fields.

**Implementation:**
- pgvector extension installed in Postgres.
- Embedding generation pipeline: on library entry create/update, call embedding API and store the resulting vector alongside the entry.
- Search endpoint: accepts query string, generates embedding, returns ranked matches by cosine similarity in Postgres (no LLM call needed for the match itself).
- Re-embedding job for when library entries are bulk-edited or when embedding model is upgraded (changes vector space; requires re-embedding all entries).
- Per-facility scoping: search results always filtered to the requesting user's facility context.

**Service:** Voyage AI's `voyage-3` model OR OpenAI `text-embedding-3-small`. Pick one based on quality on actual library content during build M2. Pricing comparable (~$0.06 per million tokens for either).

**Cost:** Library entries embedded once on creation/update. Search-time queries are cheap (~$1–2/month per facility, mostly amortised one-time embedding generation).

**Permission gating:** Any role with read access to the relevant library scope can call. Search-time call scoped to requesting user's facility context per the per-facility scoping rule.

### 9.5 Feature 5 — Natural-language search & analytics (BESPOKE, not pre-built)

**What it does:** HQ Executive types a question in plain English (e.g., "show me all High-rated risks across our terminals where the mitigation is overdue") and gets back a structured answer, a chart, or a filtered table.

**Why bespoke:**
- Text-to-SQL on a multi-facility database with audit defensibility is hard. Model has to translate natural language into a parameterised query against a constrained schema, respect facility scoping, avoid hallucinating columns/tables, handle ambiguity safely (clarify rather than guess), and produce auditable queries.
- Llama 3.3 70B will struggle. A frontier model (Claude Sonnet or GPT-4) is strongly preferred.

**Engagement model:**
- Indicative pricing: **$20,000–$40,000 USD** for the scoped query set the buyer actually wants.
- Quoted as a separate engagement when commissioned.
- **Not on the public roadmap.** If listed as "coming soon," every executive demo asks for it — under-delivers.
- Mention only when a buyer raises the need.

**v1 build effort:** **Zero hours.** Future bespoke engagement.

### 9.6 Feature 6 — Smart tagging of risk scenarios (BASE)

**What it does:** When an Author saves a new risk scenario, Vantage suggests 2–4 tags from a controlled vocabulary (threat type, asset class, region, consequence category) for the Author to confirm or override. Drives consistency in downstream analytics, search, and cross-facility comparison.

**User flow:**
- Author writes a new risk scenario in Section 6.
- Author clicks Save (or autosave fires).
- Vantage backend calls the AI service module with scenario text + controlled vocabulary, requesting **structured output** (JSON: `{ tags: [...] }`).
- System validates returned tags against the controlled vocabulary and **discards any not in the dictionary**.
- Suggested tags appear as chips below the scenario, marked "AI-suggested."
- Author can keep all suggestions, remove individual ones, add manual tags from the vocabulary, or override entirely.
- Once Author confirms (explicit click or 30-second timeout), tags persist as **confirmed**.
- Confirmed tags drive downstream filtering, search, cross-facility analytics.
- **Audit log records both AI-suggested tags AND Author-confirmed tags separately.**

**Permission gating:** acting role == Author AND assessment state == Draft.

**Service:** Together AI / Llama 3.3 70B with structured output. ~300 input tokens, ~50 output tokens, ~$0.0003 per call. Latency under 2s. Runs after save so user is not blocked.

**Cost:** ~$0.50–$1.50/month per facility.

**Vocabulary curation:** Starter vocabulary seeded from threat classifications and asset class definitions in the SRA template. Admin manages controlled vocabulary via Admin UI. New tags get added when patterns emerge in Author free-text. Owned by the platform operator (Alora) per the AI Operations Playbook.

### 9.7 Cross-cutting AI requirements

**Audit logging (mandatory):** Every AI call writes an audit log entry with these fields:
- `feature` — which feature triggered the call (e.g., `drafted_summary`, `anomaly_detection`)
- `facility_id` — requesting facility
- `user_id` — user who triggered (or `system` for batch jobs)
- `provider` — `together_ai | anthropic | openai`
- `model` — full identifier (e.g., `llama-3.3-70b-instruct-turbo`, `claude-3.5-sonnet`)
- `input_tokens`, `output_tokens` — counts
- `cost_usd` — calculated cost
- `latency_ms` — end-to-end latency
- `outcome` — `success | error | timeout | rate_limited | cost_ceiling_hit`
- `error_detail` — error class and brief description if not success
- `trace_id` — correlation ID for matching back to platform request logs

**Per-facility scoping enforcement:**
- Every AI call must include `facility_id` in request scope.
- Prompt context construction must filter to requesting facility's data only.
- Cross-facility data permitted ONLY for HQ-level roles with explicit cross-facility access (Cross-facility Consistency Flagging only).
- Code review must check this on every AI feature contribution.

**Provider switching:**
- Per-feature provider routing in YAML config (`/config/ai-providers.yaml`).
- Switching a feature from Together AI to Claude/GPT-4 requires: edit YAML → code review → deploy. **No code changes to feature itself.**
- After switching, monitor audit log and cost dashboard for 1 week to confirm quality and cost.

**Mitigation Owner has NO AI:** No AI affordance is rendered in the Mitigation Owner UI. The My Mitigations dashboard, mitigation detail panel, and progress note textarea contain no AI features in v1. Server-side: any AI endpoint called from a Mitigation Owner session returns **403**.

**AI suggestions are advisory:** If any future AI feature surfaces suggestions tied to user comments (e.g., suggesting Reviewer comment wording), AI suggestions are **advisory only**. Final wording is always the human reviewer's responsibility. Audit log records BOTH what AI suggested AND what user actually wrote, so any divergence is preserved.

**Operational handoff:** Ongoing AI work after launch (prompt iteration, rule curation, vocabulary management, provider quality monitoring) is owned by the platform operator (Alora) and described in the AI Operations Playbook. **The dev team is not responsible for ongoing AI ops.**

### 9.8 Future considerations (not in v1)

- **AI summarisation of progress logs.** As mitigations accumulate progress notes over months, the log can become long. A possible future enhancement: AI summarisation (e.g., "12 entries; vendor procurement complete in March, install begun in May, currently on track for June completion."). Summary advisory only; full log remains authoritative. **Not in v1; flagged so design and data model do not preclude it.**
- **Entity obfuscation / tokenisation layer.** Pre-process queries to remove sensitive entities before sending to providers. Quoted as separate engagement if a regulated customer requires it.
- **On-prem self-hosting.** Llama 3.3 is open-weight, so a future air-gapped customer could host the same model on-prem. Quoted as separate engagement.
- **Multi-provider gateway with strict isolation.** Out of v1 scope.

---

## 10. Audit log & version history

The platform maintains **two distinct historical records** that serve different purposes. Both must exist; neither replaces the other.

| | **Audit log** | **Version history** |
|---|---|---|
| **What it captures** | Granular action records (every create/update/delete, sign-in, role switch, configuration change, lock/unlock, AI call, workflow transition) | Snapshots of an Assessment finalised at the moment of approval |
| **Mutability** | Immutable. No role can delete or modify entries. | Frozen on approval; subsequent edits create new Versions. |
| **Granularity** | Field-level changes with old/new values | Full Assessment snapshot |
| **Retention** | 7 years default (configurable per industry; some industries require longer) | Permanent (versions live forever; nothing lost between annual cycles) |

### 10.1 Audit log

**Per-entry fields:**
- `timestamp` — when the action occurred (UTC, with timezone indicator)
- `user_id` — who performed it (or `system` for batch jobs)
- `acting_role` — the role under which the action was taken (matters for multi-role users)
- `action_type` — `create | update | delete | sign-in | sign-out | submit | review-complete | send-back | approve | reject | comment | flag | lock | unlock | role-switch | config-change | ai-call | export | audit-log-access` (etc.)
- `entity_type` — which entity was affected (Assessment, Asset, Threat, Evaluation, Mitigation, Library Entry, Configuration, etc.)
- `entity_id` — primary key of the affected entity
- `old_value` — for updates: the prior value (full diff for structured fields; field-level for primitives)
- `new_value` — for updates: the new value
- `comment` — comment text where applicable (send-back reason, configuration change reason)
- `source_ip` — requester IP
- `facility_id` — facility scope
- `assessment_id` — assessment scope (where applicable)
- `trace_id` — correlation ID (matches back to request logs)
- `metadata` — feature-specific contextual data (e.g., AI call: model version, tokens, cost)

**Implementation requirements:**
- **Append-only** at the database level. Use database constraints, triggers, or row-level security to prevent UPDATE / DELETE on the audit log table.
- **Optionally backed by a hash chain** for tamper-evidence (each entry's hash includes the previous entry's hash; tampering visible by hash mismatch). Recommended but `TODO:` confirm whether v1 requires hash chaining or can defer to a future hardening engagement.
- Reading the audit log at the facility level **writes its own audit entry** (Admin must enter a reason for accessing facility-specific logs).

### 10.2 Audit log visibility (per role)

- **Author / Reviewer**: field-level edit history within the **current Draft**, surfaced inline as a small history icon next to fields with edits. Does NOT see older audit history beyond the current draft.
- **Approver**: full audit log for any Assessment within their facility, accessible via an **Audit tab on each Assessment**. This includes prior versions' audit history.
- **HQ Executive**: **summary-level audit** (who approved what when) across all facilities they have HQ access to. **Does NOT see field-level edit details.**
- **Admin**: all audit logs across all facilities they administer, **with reason logging** — Admin must enter a reason for accessing logs of any individual facility; this access itself writes an audit entry.

**CSV export:** Approver and Admin only. Export action itself is logged.

### 10.3 Workflow transition audit entries

Every state transition (§5.2) writes an audit entry capturing:
- Timestamp
- User
- Acting role
- Action type (e.g., `submit`, `review-complete`, `send-back`, `approve`, `reject`, `withdraw`, `recall`)
- Comment text (mandatory for send-backs and rejects; optional for approve)
- Recipient role (where applicable)

### 10.4 Version history

Each time an Assessment is **Approved**, a new **Version** is finalised and archived. Versions are full snapshots of structured data at the point of approval, **plus** a snapshot of the Configuration in force (matrix, thresholds, threat list, library state at the moment of approval).

**Visibility:**
- All roles within a facility see their own facility's prior Versions (read-only).
- HQ Executive and Admin see Versions across all facilities within their scope.
- A **compare-versions view** highlights field-level changes between any two Versions.

**Implementation:**
- Versions are **immutable snapshots**, not "live" records. Editing a Version is impossible — the only way to change content after approval is to create a new Version via a new approval cycle.
- Configuration freeze: store the relevant matrix/threats/bands/criticality config alongside the Version so the rendered view of an old Version uses the rules in force at the time, not the current rules.
- Side-by-side diff: budget for ~1 week of focused work for a polished version-comparison view (per dev estimation).

### 10.5 History tab UI

- Each Assessment has a **History tab** with two sub-tabs: **Audit Log** (granular entries) and **Versions** (snapshots).
- **Audit Log sub-tab:** chronological list with filters (user, date range, action type, entity). Each entry expandable to show old/new value diff.
- **Versions sub-tab:** timeline of approved Versions. Click any Version to open in read-only mode. Select two Versions for side-by-side comparison.

---

## 11. Locking system (4 lock types)

The platform supports **granular control over which fields can be edited at which workflow stage**. Four lock types exist, each with distinct semantics.

### 11.1 Type 1 — Workflow-state locks (system-controlled, automatic)

- When Assessment moves **Draft → In Review**: all structured fields lock for Authors. Reviewers can comment but not edit.
- When Assessment moves to **Approved**: all fields lock permanently for everyone. Changes require a new Version. Section 7 mitigation Status and progress notes remain editable by Mitigation Owners (this is the only post-approval edit pathway).
- These are **automatic** based on state transitions. Not user-controllable.

### 11.2 Type 2 — Field-level review locks (Reviewer/Approver-controlled)

During review, a Reviewer can right-click any field and select **Lock this field**. The locked field cannot be edited by Authors **even if the Assessment is sent back to Draft**. A small lock icon shows lock metadata on hover (locker, timestamp, reason).

**Why this exists:** Prevents the failure mode where an Author submits, gets feedback, and silently changes a contested field on resubmission.

**Flow:**
- Reviewer hovers a field; Lock icon appears.
- Reviewer clicks Lock, enters optional reason, confirms.
- Field visually marked as locked. Lock metadata visible on hover.
- If Assessment sent back to Draft, Author can edit unlocked fields but not locked ones. Author sees clear indicator and can request unlock through a comment on the field.
- **Only the same Reviewer or an Approver can unlock.** Lock and unlock actions audited.

### 11.3 Type 3 — Configuration locks (Admin-controlled)

Some platform-wide configurations are locked from facility editing during normal operation. These include:
- The 5×5 matrix value definitions
- The 8 default Category names and descriptions (in their default state)
- The standard library entries (in their default state)
- Risk-rating value labels
- Workflow stage labels

Admin can unlock for editing during a **controlled change window**, then re-lock. All changes versioned and audited. Authors and Approvers see notifications when configurations change.

### 11.4 Type 4 — Facility administrative lock (Admin-controlled)

In rare cases — audit, investigation, dispute — Admin can fully lock all Assessments for a facility, preventing edits or new Drafts. Facility users see a banner explaining the lock and pointing to a contact.

**Use cases:** regulatory hold, internal investigation pending, contractual dispute, emergency change freeze.

### 11.5 Implementation notes

- Field-level locks add complexity to the data model. Each editable field potentially carries lock metadata (`is_locked`, `locked_by`, `locked_at`, `lock_reason`).
- The UX of showing locks (icons, hover states, request-unlock affordances) takes more time than the underlying logic — budget appropriately.
- All four lock types are independent. A field can be subject to Type 1 (state lock) AND Type 2 (review lock) simultaneously; the strictest applies.

---

## 12. Library management

Five reusable libraries provide pre-written suggestions to reduce Author typing burden and drive consistency:

| Library | Used in | Default count (seed) |
|---|---|---|
| **Scenarios** | Section 6 (Risk Scenario field) | 8 seed entries |
| **Mitigations** | Section 6 (Proposed Mitigation field), Section 7 | 6 seed entries |
| **Vulnerabilities** | Section 6 (Vulnerabilities field) | 4 seed entries |
| **Controls** | Section 6 (Existing Controls field) | 4 seed entries |
| **Consequences** | Section 3 (Consequences), Section 6 (Consequences of Risk Scenario) | 3 seed entries |

### 12.1 Per-entry fields

- **ID** — unique identifier
- **Text** — the reusable content
- **Tags** — list of taxonomy tags (e.g., `theft`, `criminality`, `surveillance`, `cyber`)
- **Used in / Used count** — count of how many Evaluations / Assessments reference this entry (read-only, derived)

### 12.2 Library use in the editor

- Author working in any Section that pulls from a library can search/select to insert pre-populated content.
- **Semantic search** (§9.4) returns matches by meaning, not just keyword. Top 10 results with similarity score visible.
- Author can **promote a newly-written entry** to the library ("save to library") — subject to Admin approval.

### 12.3 Library admin

Admin manages each library via tabbed UI in the Library Management surface. CRUD operations:
- **Add** new entries
- **Edit** existing entries (text, tags)
- **Delete** entries
- **Deprecate** entries (preserves historical references but excludes from new-suggestion lists)
- **Merge** duplicates

All library entry changes write to the audit log.

When a library entry is updated, **its embedding must be regenerated** for semantic search to reflect the change. The re-embedding job runs automatically on save.

### 12.4 Library scope

Libraries are **per-facility**. The same operator's facilities can have different library entries.

> `QUESTION:` Should there be an operator-level shared library that facilities inherit/extend, or are libraries strictly per-facility? The Workflow Validation document suggests "five reusable libraries" without specifying scope. Recommend: per-facility by default with an optional "operator template library" that Admin can copy into a new facility at onboarding. Confirm.

---

## 13. Admin configuration surfaces

The Admin role has a tabbed dashboard. Top nav has four primary tabs and the Overview tab provides navigation to four configuration surfaces.

### 13.1 Admin top-level tabs

1. **Overview** — facility context strip (facility name, last updated, operator handover status), four navigation tiles to Platform Configuration / Library Management / Notifications / Export Template, plus an "About the Admin role" callout explaining the consultant-to-operator handover model.
2. **Users & Roles** — manage all platform users for this facility (per §13.5).
3. **Default Assessment Teams** — map each facility to its default Author / Reviewer / Approver (per §13.6).
4. **Mitigation Owner Pool** — manage role labels mapped to platform users (per §13.7).

### 13.2 Configuration surface — Platform Configuration

Reachable from the Overview tab.

**Risk Matrix:**
- 5×5 grid display
- Editable consequence severity definitions for each numeric level (1–5) across all four (default) consequence axes (People, Assets, Environment, Reputation)
- Editable likelihood definitions for each numeric level (1–5)
- Approved Assessments freeze the matrix at approval — subsequent edits don't retroactively alter approved assessments

**Threat Classifications:**
- Editable table with `id`, `name`, `short label`, `definition`
- Add / Delete supported
- Default 8 categories ship as starting configuration

**Consequence Axes:**
- Editable cards with `name`, `description`, `notes`
- Add / Delete supported
- Default 4 axes (People / Assets / Environment / Reputation); some operators add Information/Cyber, Patient Safety, Mission Capability

**Risk Band Thresholds:**
- Editable rows with `band label`, `min score`, `max score`, `treatment rule`
- Score range derives from matrix (1×1 = 1 minimum, 5×5 = 25 maximum)
- Default bands: Low ≤ 4, Medium 5–9, High 10–15, Very High 16–25
- Configurable per organisation; some operators use 3 bands, some use 5

### 13.3 Configuration surface — Library Management

Reachable from the Overview tab. Tabbed layout with five tabs (one per library — see §12). Each tab is an editable table with `id`, `text`, `tags`, `used in count`. Add / Delete supported.

### 13.4 Configuration surface — Notifications

Reachable from the Overview tab.

**Active at launch:**
- **Triggers table** with columns: Active toggle, Event, Recipients, Escalation rule
- Add / Delete supported
- **Eight default triggers seeded:**
  1. Assessment submitted
  2. Review complete
  3. Approved
  4. Mitigation overdue
  5. Comments added (in In Review state)
  6. Lock applied
  7. AI flag raised (anomaly detection)
  8. Version created (post-approval)

**Visible-but-disabled placeholder:** Email template editor (an add-on capability not built in v1). Four template cards (Assessment submitted, Review complete, Approved, Mitigation overdue) with lock icons and a callout describing that the editor is available as a separate add-on engagement.

### 13.5 Configuration surface — Export Template

Reachable from the Overview tab.

**Active at launch:**
- **Standard SRA Template card** with Active badge
- **Section-binding table** showing every part of the SRA template (Cover front-matter, Sections 1–8, Appendices A/B/C) and what platform data populates each
- **Document Approvals and Version Control front-matter rows highlighted** to make clear these populate automatically from platform data

**Visible-but-disabled placeholder:** Upload area for a custom template, disabled with an "add-on" badge. Custom template support is an add-on engagement (Phase 3+).

### 13.6 Users & Roles tab

Editable table of all platform users for this facility.

**Columns:** Name, Email, Role(s), Facility access, MFA status (Enabled / Disabled), Last sign-in.

**Actions:** Inline edit, Add user, Delete. Each change writes to audit log.

**MFA Policy editor (subsection):** Per-role MFA Required toggle for the six roles (Author, Reviewer, Approver, HQ Executive, Admin, Mitigation Owner). Save writes to facility configuration table; audit log records the change. On next login, users whose role(s) require MFA are prompted to enable MFA if not already configured.

### 13.7 Default Assessment Teams tab

Editable table mapping each facility to its default Author / Reviewer / Approver.

**Columns:** Facility, Default Author, Default Reviewer, Default Approver.

**Per-row inline edit;** user dropdowns filtered to users with the appropriate role at this facility.

**Effects:**
- Every new Assessment pre-populates Document Approvals (Section 9) from this configuration.
- Per-assessment override is supported: an Author can change the assigned team for that specific assessment without affecting the default.

### 13.8 Mitigation Owner Pool tab

Editable list of role labels mapped to specific platform users.

**Example entries:** `Security Manager → C. Adeyemi`, `IT Manager → J. Onyema`, `Facility Operations → B. Onuoha`, `HSE Lead → A. Reviewer`, `Marine Operations → C. Adeyemi`, `Social Performance Manager → — unassigned —`.

**Behaviour:**
- Role labels appear as suggestions in Section 7's Owner dropdown alongside individual user names. Authors typically pick a role label rather than a specific person.
- The user the role label resolves to gains access to the My Mitigations view for the open mitigations associated with that label.
- **Pool entries are facility-scoped** — the same role label can resolve to different users at different facilities.
- A Mitigation Owner who holds the same role label across multiple facilities sees mitigations from all those facilities in their My Mitigations view.
- See §3.1 (Mitigation Owner) and §7.4 for Pool role-holder change behaviour.

### 13.9 Configuration audit & freezing

- **All configuration changes write to the audit log** with timestamp, Admin user, before/after values, optional reason.
- **Approved Assessments freeze the configuration in force at the time of approval.** Subsequent configuration changes do not retroactively alter approved assessments. Implementation: snapshot the relevant config at approval time, store with the Version, render correctly when viewing historical versions.

---

## 14. HQ Executive dashboard

The HQ Executive role lands on a dedicated **Enterprise Risk Overview** dashboard. The dashboard is **scoped to the operator's portfolio** — HQ Executives never see other operators' data.

### 14.1 KPI strip (4 cards across the top)

1. **Open evaluations** — total count across all facilities in scope, with subtitle "N facilities"
2. **High / Very High risks** — count of evaluations with R1 in High or Very High band, across all sites
3. **Overdue mitigations** — count of mitigations whose target date has passed and status != Done; subtitle "Action required" if > 0
4. **Inconsistency flags** — count of AI-detected outliers from the Cross-facility Consistency Flagging feature (only shows when add-on enabled)

### 14.2 Risk heatmap (Facility × Threat)

- Rows: each facility in scope
- Columns: each threat classification (default 8)
- Cell colour: highest R1 score in that facility for that threat (Low / Medium / High / Very High band colours)
- Cell tooltip on hover: count of evaluations contributing, top scenario summary
- Empty cell: facility has no evaluation for that threat

### 14.3 Drill-down

- HQ Executive can click any facility row to open that facility's full Assessment in **read-only** mode.
- Can compare any two Versions of a facility's Assessment side-by-side (per §10.5).
- Can compare two facilities side-by-side (cross-facility comparison).

### 14.4 Filters

- Facility (multi-select)
- Time range (default: last 30 days)
- Rating threshold (only show evaluations at or above selected band)
- Threat category (multi-select)

### 14.5 Trends

- Line / bar chart showing risk-posture changes over time (e.g., open mitigations closing out, new High-rated risks emerging by quarter)
- Trend window configurable

### 14.6 Inconsistency flags (Cross-facility Consistency Flagging add-on)

When the add-on is enabled, flagged outliers appear with:
- Severity (High / Medium / Low based on standard deviation count)
- AI-generated rationale (one short paragraph)
- Drill-into-facility link
- Action: Review, Dismiss with reason, Send back to Author for re-assessment

### 14.7 Export

- Export the dashboard view as PDF (enterprise risk overview report)
- Per User Flows: "Last 30 days" badge on the dashboard suggests the dashboard's refresh window is configurable; default 30 days

> `TODO:` Confirm how often the dashboard data refreshes (real-time, hourly batch, daily batch). Recommend: aggregations cached and refreshed every 15 minutes; consistency flags refreshed nightly per the batch job schedule. Confirm.

---

## 15. Notifications

### 15.1 Default notification triggers

Eight default triggers ship at launch (see §13.4):

1. **Assessment submitted** → Reviewer(s) for that facility
2. **Review complete** → Approver(s) for that facility
3. **Approved** → Author, Reviewer, HQ Executives, assigned Mitigation Owners (notification of pending assignments)
4. **Mitigation overdue** → assigned Mitigation Owner, with optional escalation to facility Approver after N days
5. **Comments added** (Reviewer comment in In Review state) → Author
6. **Lock applied** (Type 2 review lock) → Author (informational)
7. **AI flag raised** (Anomaly Detection add-on) → Author (informational, advisory only)
8. **Version created** (post-approval) → Author, Reviewer, Approver, HQ Executives

Each trigger has:
- Active toggle
- Recipients (role-based or user-list)
- Escalation rule (after N days, escalate to next-level role)

### 15.2 Notification channels

- **Email** (primary in v1)
- **In-platform notifications** (the bell icon / notification feed)

> `QUESTION:` SMS, Slack, MS Teams, push notifications (mobile/desktop PWA push) — are any of these in scope? Recommend: not in v1; expose webhook/integration capability as a Phase 3 add-on. Confirm.

### 15.3 Cross-role workflow notifications (defined in workflow specs)

- **Send-back / reject** → recipient sees in-platform receipt banner (§5.4) and email
- **Pool role-holder change** → new holder receives "You've inherited N mitigations" notification
- **Mitigation marked Done** → assessment's Author and Approver receive in-platform notification

### 15.4 User notification preferences

Per-user preferences for notification frequency (immediate / daily digest / off) per trigger type. Mitigation Owner default: immediate for assignment, daily digest for overdue.

> `TODO:` Confirm whether per-user notification preferences are in v1 scope or deferred. Recommend in v1 since they're cheap to build and reduce notification fatigue.

### 15.5 Email templates

- Default templates ship with the platform.
- **Visual email template editor** (placeholder mapping, preview rendering) is **NOT in v1** — available as a separate add-on engagement (per §13.4).

---

## 16. Document export

### 16.1 Export formats

- **Word (.docx)** — primary format, matches the standard SRA template
- **PDF** — derived from Word OR generated from HTML

### 16.2 Export scope

- Exports available from any state — but **Draft and In Review** exports include a watermark indicating they are non-final.
- Approved exports are clean (no watermark).

### 16.3 Sections in the exported document

- **Cover page** with metadata (Asset Name, Approval Date)
- **Document Approvals front-matter table** (auto-populated)
- **Version Control front-matter table** (auto-populated)
- **Sections 1–8** with formatted tables matching the standard SRA layout
- **Appendices** (Section 9): SRA Team Members, References, Risk Assessment Matrix
- Sections 5/6/7 rendered as the same tables shown in the standard corporate template

### 16.4 Front-matter tables (auto-populated)

**Document Approvals:**
- Columns: Role (Author / Reviewer / Approver), Name, Position, Signature & date
- Populated from the Assessment's assigned Author/Reviewer/Approver at approval time + their sign-off timestamps from the audit log
- Dual-role acknowledgement note (if applicable per §3.3): "(dual-role acknowledged)" beside the user's name in the Approver row

**Version Control:**
- Lists every approved version of this Assessment with: Document Version Tag, Author, Approver, Approval Date, Comments / Change Log
- Populated from the platform's assessment version history

### 16.5 Implementation notes

- Word export must match the existing corporate SRA template **closely** (typically the most underestimated line item in builds like this).
- The Export Template configuration screen shows the full section-binding map for the dev to follow.
- **Custom export template upload** is a Phase 3 add-on (placeholder mapping, preview rendering). v1 main build supports the standard SRA template only.
- Export is downloaded; download is logged for audit (see §10.1).
- Performance target: document export under **30 seconds** end-to-end.

> `QUESTION:` Email-the-export functionality (deliver the exported file to a recipient's email rather than browser download) — in scope? Recommend not in v1 (browser download is fine and simpler); add as a Phase 3 enhancement if requested.

---

## 17. Multi-facility / multi-tenant architecture

### 17.1 Mandatory from day one

Vantage **must be multi-facility from the first commit, not retrofitted.** Every Assessment, library entry, threat list, matrix, role assignment, etc. must be stored with a `facility_id`; application code reads the right configuration based on which facility the user belongs to.

The build ships with the first facility's configuration as seeded data; subsequent facilities are onboarded as new deployments **without rework**.

### 17.2 Per-facility configuration data (NOT hardcoded)

The following must be **per-facility configuration data**, not hardcoded application logic:
- The 5×5 risk matrix (grid math AND qualitative consequence/likelihood definitions per axis)
- Threat classifications (currently 8 categories; varies by operator/industry)
- Consequence axes (currently People/Assets/Environment/Reputation; some operators add Information/Cyber, Patient Safety, Mission Capability)
- Risk band thresholds (score ranges mapping to Low/Medium/High/Very High; some operators use 3 bands, some 5)
- Asset criticality levels (labels and number of bands)
- Workflow approval roles and rules (some operators require dual approvers, some require HQ approval for High/Very High ratings only — `TODO:` confirm dual-approver / HQ-approval-for-high requirements as configurable workflow)
- Notification triggers (which workflow events trigger notifications, who receives them, escalation rules)
- Document export template (each operator may want exports matching their own corporate template; default is standard SRA template)
- Library entries (Scenarios, Mitigations, Vulnerabilities, Controls, Consequences)
- MFA enforcement policies (per role)
- Audit retention period (varies by industry; default 7 years)

### 17.3 Scalability requirements

**Initial deployment:** approximately 20 facilities and 30 users at launch. **Confirmed plans to scale** to 50+ facilities and 200+ users. Architecture should not impose architectural caps.

**Performance / scalability rules:**
- **Database design** (indexes, query patterns, row-level security policies enforcing facility isolation) must perform well at significantly higher facility/user counts than launch volume.
- A user at Facility A must **never** read data from Facility B unless explicitly granted cross-facility visibility (HQ Executive within an operator's portfolio).
- **List views, dashboards, and selectors must use pagination, virtualization, and search** — never fixed dropdowns or full-list rendering.
- **The role/permission model should accommodate adding regional or business-unit groupings later** without restructuring (e.g. "All Asia-Pacific facilities," "All Tier-1 refineries").
- **Background jobs** (notifications, inconsistency flagging, statistics) must perform within sub-second latency across the full data set as scale grows.

### 17.4 Row-level security (RLS)

Facility isolation must be enforced at the **database query level**, not just the application code level. Recommend Postgres RLS policies on every assessment-scoped table:

```sql
-- Pseudo-policy
CREATE POLICY facility_isolation ON assessments
  USING (facility_id = ANY(current_user_facility_ids()));
```

Where `current_user_facility_ids()` is a SECURITY DEFINER function that returns the facility IDs the authenticated user has access to (their role assignments + cross-facility roles like HQ Executive).

**Penetration-testable.** Acceptance criterion: a manual or automated test that crafts URLs and API calls attempting to cross facility boundaries and confirms 100% rejection.

### 17.5 Operator-portfolio scoping (HQ Executive)

HQ Executive sees an aggregate view across all facilities **within their operator's portfolio** — never across operators. Cross-operator data leakage is a critical security failure.

Recommended implementation:
- Each Operator has a unique `operator_id`.
- Each Facility has `operator_id`.
- Each User has role assignments tagged with `facility_id` (or `operator_id` for cross-facility roles).
- The HQ Executive role grants `operator_id`-scoped read access — every query they make is filtered to their operator's facilities.

### 17.6 Cross-facility Admin (consultant role)

Alora's consultant team may retain a **cross-facility Admin role** for ongoing support across all facilities Alora has deployed, regardless of operator. This is implemented as a **separate cross-facility role flag**, not as a special user type. Configurable per engagement; whether the consultant retains this role post-handover is per-customer decision.

### 17.7 Concurrency

- Approximately 30 simultaneous users at launch with elastic scaling required.
- **Optimistic locking on Assessment-level edits** (e.g., version number field; reject saves where the version changed underneath the user with a clear "this assessment was modified by another user; reload to continue" message).
- Field-level concurrent editing is rare given the single-Lead-Author model, but optimistic locks at the field level may also be appropriate.

---

## 18. Non-functional requirements

### 18.1 Authentication
- Email/password with secure password storage (bcrypt or stronger).
- MFA enforced per role with policy configurable per facility.
- Account lockout after configurable failed attempts.
- Email-based password reset flow.
- Configurable session timeouts.
- All sign-in attempts logged to immutable audit trail.
- **SSO via SAML/OIDC explicitly out of scope at client request.**

### 18.2 Authorisation
- Row-level security at the database layer.
- A user with Author role at Operator A must never read data from Operator B.
- Facility isolation enforced at the database query level, not just application code.
- Penetration testable.

### 18.3 Audit logging
- Every create/update/delete on any structured data writes an entry.
- **Audit log retained 7 years** (configurable per industry).
- Append-only at database level. No role can delete or modify.

### 18.4 Encryption
- **TLS 1.3** in transit.
- **AES-256** at rest.
- Cloud KMS for keys.

### 18.5 Backups
- **Daily backups, 30-day retention.**
- **Point-in-time recovery to last 7 days.**

### 18.6 Performance
- Most page loads under **2 seconds**.
- Pivot grid (Section 5) under **3 seconds** for up to 50 Items × 8 Categories.
- Document export under **30 seconds**.
- Semantic search under **500ms**.
- Anomaly Detection under **3 seconds** (including 800ms debounce).

### 18.7 Browser support
- Latest **Chrome, Edge, Safari, Firefox**.

### 18.8 Mobile and offline
- Responsive web design.
- Main build includes graceful offline read-only fallback (last cached state visible with clear indicator).
- **Field mode** (per-section checkout AND offline authentication) ships in main build per §8.
- **Field mode is device-agnostic via PWA** — laptop (Chrome/Edge install on Windows/macOS), tablet, and phone (iOS Safari, Android Chrome) are all first-class targets, **NOT a mobile-only feature**.

### 18.9 Concurrency
- ~30 simultaneous users at launch with elastic scaling required.
- Must accommodate growth without architectural rework.
- Optimistic locking on Assessment-level edits.

### 18.10 Internationalisation
- **English only** in v1.
- Date and number formatting localised by browser.

### 18.11 Data model — User vs Contributor (clear separation)

The platform has a **clear separation** between:
- **User** — platform user with email, password, MFA, role assignments, audit-trail identity. Authoritative identity.
- **Contributor** — per-assessment record with name, position, expertise, company. **No login, no auth, no workflow obligations, no audit-log identity.** Embedded record on each Assessment.

The contributor directory used by Section 9 autocomplete is a **derived view computed at query time** over historical assessment data. There is **no separate CRUD interface for it.** See §6.9.

### 18.12 Accessibility
- **WCAG 2.1 AA** as a baseline.
- Sufficient colour contrast.
- Keyboard navigation throughout.
- Screen-reader compatibility.

### 18.13 Security
- Server-side permission checks on every endpoint (per §3.4).
- All user input validated and sanitised.
- SQL injection protection via parameterised queries / ORM.
- XSS protection via strict CSP and proper output encoding.
- CSRF protection on state-changing endpoints.
- Rate-limiting on auth endpoints and AI endpoints.
- Penetration test conducted at end of build (per dev MSA Schedule B M6).
- All Critical and High severity findings must be remediated before production launch.

### 18.14 Hosting (NOT business logic but flagged for context)
- Frontend: Vercel.
- Backend: Vercel serverless or Railway (per dev preference).
- Database: Postgres (via Supabase or equivalent).
- pgvector extension for semantic search.
- AI: Together AI primary; Claude/GPT-4 fallback.
- Audit log: Postgres table with append-only constraints + RLS.
- Email: Resend, Postmark, or equivalent.
- Monitoring: Sentry for errors, basic uptime monitoring.

> Stack details belong in `server.md` / `readme.md`, not here. Flagged for context only.

---

## 19. Reference data (seed values)

These are the **default seed values** the platform ships with. All are configurable per facility by Admin. Use these as the seeded starting point for the first facility.

### 19.1 Threat classifications (default 8)

| ID | Name | Short label |
|---|---|---|
| t1 | Organized Crime | Org. Crime |
| t2 | Criminality | Criminality |
| t3 | Civil / Community Unrest | Civil Unrest |
| t4 | Armed Conflicts | Armed Conflict |
| t5 | Terrorism | Terrorism |
| t6 | Cybercrime & Data Breaches | Cyber |
| t7 | Insider | Insider |
| t8 | Maritime | Maritime |

### 19.2 Asset criticality levels (default 4)

`Low | Medium | High | Very High`

### 19.3 Consequence severity levels (0–5)

| Value | Label |
|---|---|
| 0 | No effect |
| 1 | Slight |
| 2 | Minor |
| 3 | Moderate |
| 4 | Major |
| 5 | Massive |

### 19.4 Likelihood levels (1–5)

| Value | Label | Description |
|---|---|---|
| 1 | Very Low | Never heard of in industry |
| 2 | Low | Heard of in industry |
| 3 | Medium | Has happened in the organisation |
| 4 | High | Has happened at the location |
| 5 | Very High | More than once per year at this location |

### 19.5 Default consequence axes (4)

- **People** — injury / health effect / fatality
- **Assets** — damage from no damage to massive damage
- **Environment** — environmental effect from no effect to massive effect
- **Reputation** — reputational effect from no effect to massive effect

Some operators add: Information/Cyber, Patient Safety, Mission Capability.

### 19.6 Default risk band thresholds

Computed from `score = Consequence × Likelihood` (range 1–25):

| Band | Score range | Colour (default) |
|---|---|---|
| Low | ≤ 4 | green (#10b981) |
| Medium | 5–9 | yellow (#eab308) |
| High | 10–15 | orange (#f97316) |
| Very High | 16–25 | red (#dc2626) |

### 19.7 Default Mitigation Owner Pool labels (seed)

(Operator A — Lagos Refinery example from the demo)

| Label | Mapped to (example) |
|---|---|
| Security Manager | C. Adeyemi |
| IT Manager | J. Onyema |
| Facility Operations | B. Onuoha |
| HSE Lead | A. Reviewer |
| Marine Operations | C. Adeyemi |
| Social Performance Manager | — unassigned — |

### 19.8 Default Section 9 reference categories

- Facility schematic
- Relevant threat documentation, past SRA reports
- Incident records
- Pictures of facility
- Technical security equipment

### 19.9 Default audit retention

- **7 years** (configurable per industry)

### 19.10 Default offline parameters

- Maximum offline window: **7 days** (Admin can configure 1–7)
- Minimum PIN length: **6 digits** (Admin can configure 4–8)
- Failed-attempt threshold: **5** (Admin can configure 3–10)
- Biometric availability: **allowed** by default

### 19.11 Default monthly AI budgets

- Per facility: **$50/month** (covers all features at typical usage)
- Per operator (HQ-level features): **$20/month**

---

## 20. Open questions & TODOs (consolidated)

This section lists every `TODO:` and `QUESTION:` flagged inline. Resolve each before development begins (or accept the recommended default and remove the marker). Sorted by section.

### Roles & permissions

1. **§3.1 Author** — Is "Author" and "Lead Author" the same role-name, or do we need a separate "Contributor Author" / deputy role for handover targets? Recommended: treat "Lead Author" as a designation on the Assessment (the user currently filling that slot) and "Author" as the platform role. **Confirm.**

2. **§3.1 HQ Executive — comment authority conflict.** Platform Overview says HQ Executive can leave comments visible to Approvers; User Flows says HQ Executive cannot comment. **Reconcile.** Recommended: HQ Executive **may** leave a comment on an approved or in-review assessment that surfaces to the facility's Approver as a notification; comment is read-only by recipient and lives at the assessment level (not inline per field).

3. **§3.3 Dual-role policy scope.** Platform Overview says per-organisation, User Flows says per-facility, Workflow Validation says per-organisation. **Reconcile.** Recommended: per-facility (matches the rest of the configuration model).

### Auth & sessions

4. **§4.1 Password complexity policy.** Specific rules unspecified. Recommended: minimum 12 characters, no enforced complexity rules beyond that (per current NIST guidance), with breach-list checking (HaveIBeenPwned API). **Confirm with security team.** Configurable per organisation.

### Assessment lifecycle

5. **§5.6 Withdraw / recall semantics.** The JSX has `WithdrawModal` with `mode: 'withdraw' | 'recall'` but full semantics are not specified in source docs. **Define:** Who can withdraw (Author? Reviewer?), at which states, with what signature-clearing rules. Recommended:
   - **Withdraw** (Author): recalls a submitted Assessment from In Review back to Draft (before Reviewer has acted). Requires reason; clears Author signature.
   - **Recall** (Author or Reviewer?): from Awaiting Approval back to In Review or Draft. Requires reason; clears appropriate signatures.

### The 9 sections

6. **§6.2 Section 2 fields** — should Asset/Facility Type be a controlled enum or free text? Recommended: configurable enum with "Other (specify)" fallback.

7. **§6.3 Asset Type field.** The JSX demo includes a `Type` column in Section 3 ("Process Unit", "Storage Tank Farm", etc.) that is NOT in the SRA template. Decide whether to include in v1 platform UI. Recommended: include as an internal-only field (visible in the platform UI but **not** rendered in the standard SRA export to keep the export template-faithful). **Confirm.**

8. **§6.5 Section 5 naming** — "Asset Attractiveness" (template name) vs "Cross-Reference Matrix" (User Flows name) — use both in the UI label for clarity (e.g., "Section 5: Asset Attractiveness Cross-Reference").

9. **§6.9.B References — file storage policy.** Need defaults for max file size, total quota per assessment, allowed MIME types, retention. Recommended: 50 MB per file, no quota at assessment level, common image/document MIME types only (PDF, PNG, JPG, DOCX, XLSX). **Confirm.**

10. **§6.10 Cloning semantics.** Confirm clone behaviour for:
   - Section 7 mitigation status — reset to Open or preserve Done? Recommended: reset to Open with a "Cloned from prior cycle; previous status: Done" note for traceability.
   - Section 9 references — file attachments duplicate or share? Recommended: clone references (URLs and metadata); file attachments share by reference (cheaper) but flag this as a privacy / IP question.
   - What happens if the configured matrix or threat list has changed between cycles? Recommended: cloned assessments use the **current** configuration with a banner explaining the configuration may have changed.

### Field mode

10. **§8.1 Field mode build scope discrepancy.** User Flows and Platform Overview say "main build"; demo JSX labels it "Phase 3." **Recommended resolution: Field mode is in the main build, both per-section checkout and offline authentication.** Update the demo's "Phase 3" label and design brief if it mirrors. **Confirm before development.**

### Audit log & versions

11. **§10.1 Hash chaining for tamper-evidence.** Whether v1 requires hash chaining or can defer to a future hardening engagement. Recommended: include in v1 (cheap to add now, expensive to retrofit). **Confirm.**

### Libraries

12. **§12.4 Library scope.** Per-facility only, or operator-level shared library that facilities inherit? Recommended: per-facility by default with an optional "operator template library" that Admin can copy into a new facility at onboarding. **Confirm.**

### HQ dashboard

13. **§14.7 Dashboard data refresh frequency.** Real-time, hourly, daily? Recommended: aggregations cached and refreshed every 15 minutes; consistency flags refreshed nightly per the batch job schedule. **Confirm.**

### Notifications

14. **§15.2 Notification channels beyond email/in-platform.** SMS, Slack, MS Teams, push notifications — in scope? Recommended: not in v1; expose webhook/integration capability as a Phase 3 add-on. **Confirm.**

15. **§15.4 Per-user notification preferences.** In v1 or deferred? Recommended in v1 (cheap to build, reduces notification fatigue).

### Document export

16. **§16.5 Email-the-export functionality.** Deliver exported file to recipient's email rather than browser download — in scope? Recommended: not in v1.

### Multi-tenancy

17. **§17.2 Workflow approval rules** — some operators require dual approvers, some require HQ approval for High/Very High ratings only. Confirm whether these workflow variations are configurable in v1 or deferred. Recommended: simple Author → Reviewer → Approver in v1; configurable variations as a Phase 3 enhancement.

### General consistency between sources

18. **Tech stack alignment.** The Vantage Dev Build Plan and Dev Team MSA specify **Next.js + TypeScript + shadcn/ui + Supabase Auth**. The friend's prompt to the user mentions **plain React + Vite + Express + raw JWT**. Resolve which stack is canonical before development. Recommended: stick with the official Vantage build plan stack (Next.js + Supabase Auth) — it's already contractually specified in the MSA, supports per-role MFA out of the box, and matches the dev team's preference. **Confirm.**

19. **Test coverage target.** The friend's prompt says "almost 100% code coverage"; the MSA Schedule C says "at least 70% test coverage on critical modules." Resolve: which is canonical? Recommended: **70% on critical modules** (matrix engine, permission checks, audit log, AI service module, sync logic) with full coverage of authentication, authorisation, and state-machine transition code. 100% is impractical and counterproductive for UI code. **Confirm.**

20. **AI obfuscation for v1.** The User Flows says AI features "MUST call through the AI gateway and obfuscation layer (sensitive entities tokenised before leaving the platform, substituted back before display)." The AI Features Spec says **"No entity tokenisation or obfuscation. Vantage v1 sends real entity names to providers."** **Reconcile.** Recommended: AI Features Spec is authoritative — v1 does NOT have obfuscation; this is a deliberate scope choice that can be added later as paid hardening for regulated customers. Update the User Flows text to remove the obfuscation requirement. **Confirm.**

### Known demo-vs-spec divergences (caught during audit)

These are places where the JSX demo behaviour does NOT match the source spec. The spec is the canonical source for production; flagging here so the divergences don't propagate during development.

21. **Reviewer send-back signature clearing.** Spec (User Flows §Workflow state machine) says reviewer-send-back clears Author + Reviewer signatures. Demo (`vantage_demo_roles.jsx` line 1029-1034) does NOT clear signatures on this transition; only the Reviewer state is reset. Production must follow the spec — clear both signatures so the Document Approvals table honestly reflects "no current submission" during a send-back-to-draft state.

22. **`Cancelled` mitigation status in demo.** Demo Section 7 has filter logic `m.status !== 'Cancelled'` (line 5511 of `Section7`) anticipating a Cancelled status, but the seed data never sets it and the Mitigation Owner spec explicitly says cancellation is NOT a Mitigation Owner action ("cancellation is the Author's authority during a new cycle"). Production should NOT include Cancelled as a Mitigation Owner-settable status. The Author's pre-approval Section 7 may have an "Agreed = No" path that is the closest analogue.

23. **Field mode "Phase 3" label in demo.** `FieldModeModal` shows a "Phase 3" pill, but the Dev Build Plan and User Flows place Field mode in the main build (M4–M5). Update the demo's label and any client-facing language that mirrors it. (Already flagged in §20 item 10; restated here for completeness.)

---

## 21. Out of scope for v1 (explicit)

The following are **explicitly NOT in v1 build scope** and should not be implemented unless specifically requested:

- SSO via SAML / OIDC
- Hardware token (YubiKey) MFA
- Adaptive / risk-based authentication
- Customer-managed identity providers
- Entity tokenisation / obfuscation layer for AI calls
- Multi-provider AI gateway with strict isolation
- AI prompt management UI
- AI model fine-tuning
- Custom export template upload (Phase 3 add-on)
- Visual email template editor (Phase 3 add-on)
- Natural-language search & analytics (bespoke; quoted on commission)
- AI summarisation of progress logs
- True co-authoring on a single Assessment (single-Lead-Author model is the design)
- SMS / Slack / Teams / push notifications
- Email-the-export (browser download is sufficient)
- Real-time collaborative editing
- Cross-operator data visibility (HQ Executive is operator-portfolio scoped)
- Internationalisation beyond English

---

## 22. Glossary

- **Alora** — the company operating the platform (consultancy / vendor). Internal name.
- **Vantage** — the platform itself. User-facing brand.
- **Assessment** — one instance of the 9-section SRA template completed for a facility in a cycle.
- **Cycle** — colloquial for a round of SRA work producing one Assessment. Annual is typical.
- **Document Approvals** — the front-matter signature table on the exported document showing Author / Reviewer / Approver names, positions, signatures, dates.
- **Evaluation** — analytical record in Section 6 for one Asset × Threat combination.
- **Facility** — deployment unit (refinery, terminal, FPSO, depot, etc.). The atomic unit of data isolation.
- **Lead Author** — the platform user currently designated as Author of an Assessment. Reassignable via §5.5.
- **Mitigation** — tracked action item in Section 7. Two-phase lifecycle.
- **Mitigation Owner** — platform role for users who progress approved mitigations. Held via the Mitigation Owner Pool.
- **Mitigation Owner Pool** — facility-level mapping of role labels (e.g. "Security Manager") to platform users.
- **Operator** — customer organisation. Has one or more facilities.
- **PWA** — Progressive Web App. The installable form of Vantage used for Field mode.
- **R1 / R2** — Pre-mitigation (R1) and post-mitigation (R2) risk ratings, calculated from the configurable 5×5 matrix.
- **RLS** — Row-level security. Database-layer enforcement of facility isolation.
- **SRA** — Security Risk Assessment. The 9-section assessment Vantage produces.
- **Version** — immutable snapshot of an Assessment finalised at the moment of approval.

---

## Document control

- **Version**: 1.0 (draft)
- **Last updated**: May 2026
- **Compiled from**: Platform Overview, User Flows, Workflow Validation, AI Features Specification, Design Brief, Master Build Plan, Dev Build Plan, SRA Template, Dev Team MSA, vantage_demo_roles.jsx (live prototype source)
- **Owner**: [TODO: assign]
- **Related docs**: `server.md`, `client.md`, `readme.md`, `plan.md` (these to be authored separately and reference this BusinessLogic.md)

> When this document is updated, increment the version, note the change in the audit log of changes (a separate `CHANGELOG.md` is recommended for the repo), and notify the dev team. Significant changes to lifecycle, permissions, or audit semantics may require contractual addendum per the Dev Team MSA.
