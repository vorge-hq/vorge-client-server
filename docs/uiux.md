
⸻

Prompt for UI/UX AI Agent: Build the Vantage App Interface

You are a senior product designer and UI/UX architect. Design the complete user interface, screen system, navigation, and user flows for a product called Vantage.

Vantage is a mobile-first, responsive web app that must also work well on desktop/tablet. It is a B2B security risk assessment platform used by consultants and operators in industries such as oil and gas, mining, ports, terminals, critical infrastructure, and offshore facilities.

The product replaces a Word-document-based Security Risk Assessment workflow with a structured, multi-user, audit-defensible digital system.

The interface must feel:

* professional
* secure
* modern
* enterprise-grade
* clear for non-technical operational users
* efficient for field analysts
* mobile-first, but not “mobile-only”
* usable on phones, tablets, laptops, and desktop browsers

The app should support a PWA-style experience, including offline/field mode.

⸻

1. Product Overview

Product name

Vantage

What the app does

Vantage allows security consultants and operator teams to create, review, approve, track, and export Security Risk Assessments, called SRAs.

Each SRA is completed for a specific Facility. A facility may be a refinery, terminal, FPSO, depot, mine, port, plant, or other operating site.

Each assessment contains 9 sections:

1. Executive Summary
2. Facility / Asset Information
3. Asset Disaggregation
4. Threat Assessment
5. Asset Attractiveness Cross-Reference
6. Vulnerability Assessment & Risk Treatment
7. Proposed Mitigation
8. Conclusion
9. Appendices

The core design challenge is to make a complex, multi-section, multi-role workflow feel clear and manageable.

⸻

2. Core Product Concepts

Design the UI around these core entities:

Operator

The customer organization. One operator can have many facilities.

Facility

A deployment unit and the main data boundary. Each assessment belongs to one facility.

Assessment / SRA Cycle

A single annual or periodic Security Risk Assessment for a facility.

Asset

A facility component captured in Section 3.

Examples:

* Marine loading terminal
* Control room
* Storage tank farm
* Utility substation
* Fuel loading skid

Threat

A threat category captured in Section 4.

Default threat categories:

1. Organised Crime
2. Criminality
3. Civil / Community Unrest
4. Armed Conflicts
5. Terrorism
6. Cybercrime & Data Breaches
7. Insider
8. Maritime

Evaluation

A Section 6 analytical record created for an Asset × Threat combination.

Mitigation

A Section 7 action item derived from a Section 6 proposed mitigation.

Contributor

A non-platform-user who contributed information to the assessment. Contributors do not log in.

Library Entry

Reusable text suggestions for scenarios, mitigations, vulnerabilities, controls, and consequences.

Audit Log

Immutable record of user actions, edits, approvals, comments, AI calls, role changes, and configuration changes.

⸻

3. User Roles

The UI must adapt based on the acting role. The same person may hold multiple roles and switch between them.

Design role-based navigation and permissions for these six roles:

1. Author / Lead Author

Main person creating and editing the assessment.

Can:

* create assessments
* edit Sections 1–9 while in Draft
* submit assessment for review
* add contributors
* use AI drafting if enabled
* use library suggestions
* view edit history
* assign mitigation owners
* clone previous assessments
* reassign Lead Author where allowed

Cannot:

* approve their own work
* edit locked fields
* edit assessment content after approval
* update mitigation progress after approval

Primary UI:

* assessment workspace
* section editor
* submission flow
* validation checklist
* field mode checkout

⸻

2. Reviewer

Quality control reviewer.

Can:

* read assessments
* review submitted assessments
* add comments during In Review
* lock validated fields
* mark review complete
* send assessment back to Author

Cannot:

* edit Author content
* approve
* comment before submission
* access Mitigation Owner dashboard

Primary UI:

* review queue
* assessment read view
* comment panel
* field lock controls
* review complete / send back actions

⸻

3. Approver

Facility manager or decision-maker who signs off.

Can:

* read assessment
* approve
* send back to Reviewer
* reject back to Draft
* view audit log
* unlock Reviewer-locked fields

Cannot:

* edit assessment content
* leave inline field comments
* access Mitigation Owner dashboard

Primary UI:

* approval queue
* assessment read view
* approval decision panel
* reject / send-back modal
* audit summary

⸻

4. HQ Executive

Cross-facility leadership viewer.

Can:

* see dashboard across facilities
* view risk heatmaps
* see overdue mitigations
* compare assessment versions
* drill into read-only assessments
* see approval summaries

Cannot:

* edit anything
* approve
* take workflow actions
* access Mitigation Owner dashboard
* view cross-operator data

Primary UI:

* executive dashboard
* portfolio risk heatmap
* facility comparison
* overdue mitigation summary
* version comparison view

There is an unresolved business decision about whether HQ Executives can leave comments for Approvers. Design this as an optional/flagged feature, not a hard dependency.

⸻

5. Admin

Facility configuration owner.

Can:

* manage users
* assign roles
* configure facilities
* configure risk matrix
* configure threats
* configure libraries
* configure notifications
* configure export template
* configure default assessment teams
* configure mitigation owner pool
* configure MFA policy
* configure offline authentication policy
* view/export audit logs with reason logging
* apply administrative locks

Cannot:

* edit assessment analytical content
* mutate audit log
* manage contributors as a separate directory
* access Mitigation Owner dashboard

Primary UI:

* admin dashboard
* user and role management
* facility configuration
* risk matrix builder
* library manager
* notification settings
* export template settings
* mitigation owner pool
* audit log viewer

Admin configuration includes platform settings such as risk bands, libraries, notification triggers, export templates, users, MFA policies, default teams, and mitigation owner pools.  ￼

⸻

6. Mitigation Owner

Person responsible for completing mitigation actions after an assessment is approved.

Can:

* see only assigned mitigations
* update mitigation status after approval
* add progress notes
* mark mitigation as Done with required note
* see progress history

Cannot:

* access Sections 1–9
* edit mitigation description, severity, owner, agreed status, or target date
* use AI
* access admin or configuration
* reopen Done mitigations

Primary UI:

* My Mitigations dashboard
* mitigation detail panel
* status update form
* progress log

Mitigation Owner navigation should be extremely minimal. Do not show disabled links to assessments or admin screens. Hide them entirely.

⸻

4. Assessment Lifecycle

Design the workflow around a 4-state machine:

State 1: Draft

Author can edit.

Reviewer and Approver may view in advance but cannot act.

State 2: In Review

Author content is locked.

Reviewer can comment, lock fields, mark complete, or send back.

State 3: Awaiting Approval

Approver can approve, send back to Reviewer, or reject to Draft.

State 4: Approved

Assessment content is locked.

Section 7 mitigation progress can be updated only by Mitigation Owners.

Workflow transitions:

1. Draft → In Review
    Trigger: Author submits
    Effect: Author signature stamped
2. In Review → Awaiting Approval
    Trigger: Reviewer marks complete
    Effect: Reviewer signature stamped
3. In Review → Draft
    Trigger: Reviewer sends back
    Effect: Author and Reviewer signatures cleared
    Show amber banner to Author
4. Awaiting Approval → Approved
    Trigger: Approver approves
    Effect: Approver signature stamped, version frozen
5. Awaiting Approval → In Review
    Trigger: Approver sends back to Reviewer
    Effect: Reviewer signature cleared
    Show amber banner to Reviewer
6. Awaiting Approval → Draft
    Trigger: Approver rejects
    Effect: all signatures cleared
    Show red banner to Author

Design visible status chips, banners, and workflow action panels for these states.

⸻

5. Global Navigation Model

Design a mobile-first responsive navigation system.

On mobile

Use bottom navigation or a compact app shell depending on role.

Suggested mobile tabs for Author/Reviewer/Approver:

* Home
* Assessments
* Tasks
* Notifications
* Profile

Inside an assessment, use:

* sticky top header with assessment name, facility, state
* collapsible section navigator
* progress indicator for Sections 1–9
* floating save/action button where appropriate
* section jump menu

On desktop/tablet

Use:

* left sidebar
* topbar with facility selector, role switcher, notifications, profile
* assessment section rail
* main content area
* right-side contextual panel for comments, history, AI suggestions, or audit details

Role switcher

Only show the role switcher to users with more than one role.

The dropdown should show:

* current role
* available roles
* facility context
* MFA prompt where required

Do not design unrestricted demo-style role switching for production.

⸻

6. Main App Areas

Design the following major areas.

⸻

A. Authentication

Screens:

1. Sign in
2. MFA challenge
3. Password reset
4. First-time MFA setup
5. Session timeout screen
6. Offline sign-in screen
7. Offline window expired screen
8. Account locked screen

Important UX rules:

* Vantage uses dedicated credentials, not corporate SSO.
* MFA requirement depends on role/facility policy.
* Failed sign-ins should show secure, non-revealing messages.
* Offline login uses PIN or biometric, not full password.

⸻

B. Home Dashboard

Dashboard should adapt by role.

Author dashboard

Show:

* active draft assessments
* assessments returned with comments
* overdue tasks
* recently edited assessments
* create new assessment button
* clone previous assessment option
* field mode status

Reviewer dashboard

Show:

* assessments waiting for review
* drafts available for advance read-only viewing
* reviews in progress
* comments left
* locked field count

Approver dashboard

Show:

* assessments awaiting approval
* upcoming approvals
* rejected/send-back history
* approval summary

HQ Executive dashboard

Show:

* portfolio risk overview
* cross-facility heatmap
* high/very high risk count
* overdue mitigations
* trends by facility
* recent approvals
* facility comparison cards

Admin dashboard

Show:

* facility configuration status
* user/role health
* MFA adoption
* library counts
* notification triggers
* audit access
* export template status
* mitigation owner pool status

Mitigation Owner dashboard

Show:

* Open count
* In Progress count
* Overdue count
* Done this year count
* assigned mitigations table
* pending assignments banner
* recently inherited mitigations

⸻

7. Assessment List Screen

Design an assessment list with:

* search
* filters
* facility filter
* state filter
* cycle/year filter
* assigned-to-me filter
* risk level filter
* overdue mitigation filter
* sort by recent activity, state, facility, due date

Assessment card should show:

* assessment name
* facility
* operator
* cycle/year
* current state
* lead author
* reviewer
* approver
* last updated
* completion progress
* high-risk count
* mitigation count
* overdue mitigation count
* action button based on role

Mobile card view should be primary.

Desktop can use a table with expandable row details.

⸻

8. Assessment Workspace

This is the core product surface.

The workspace must include:

Header

* assessment title
* facility name
* operator name
* cycle/year
* current state chip
* version number
* lock/offline indicator
* workflow action button

Section navigation

Nine sections:

1. Executive Summary
2. Facility / Asset Information
3. Asset Disaggregation
4. Threat Assessment
5. Asset Attractiveness Cross-Reference
6. Vulnerability Assessment & Risk Treatment
7. Proposed Mitigation
8. Conclusion
9. Appendices

Each section should show:

* pending / active / complete status
* validation errors
* comment count
* lock indicator if applicable

Main section content

Role-sensitive:

* Author sees editable fields in Draft
* Reviewer sees read-only content plus comments/locks in In Review
* Approver sees read-only content plus approval action panel in Awaiting Approval
* HQ Executive sees read-only content
* Admin sees read-only content only if permitted through audit/config access
* Mitigation Owner does not see assessment workspace

Right/context panel

Depending on role and state:

* comments
* field history
* AI suggestions
* validation checklist
* audit summary
* lock details
* section help

⸻

9. Section-by-Section UI Requirements

Section 1: Executive Summary

Design:

* rich text editor
* save/autosave
* AI draft button if enabled
* AI-generated draft preview
* accept/edit flow
* edit history icon
* validation state

AI draft should be optional and clearly labelled as a draft, not final content.

⸻

Section 2: Facility / Asset Information

Fields:

* Facility name
* Country / Region
* Location
* Nature of operation
* Asset / Facility type
* Accountable business manager
* Regulated asset: Yes/No
* Regulatory authority
* General information

Design as mobile-friendly form sections with progressive disclosure.

Use dropdowns where configurable, with “Other” fallback.

⸻

Section 3: Asset Disaggregation

Design an asset management screen.

Each asset includes:

* name
* optional internal type
* description and function
* dependencies/interdependencies
* consequences
* asset criticality: Low / Medium / High / Very High

UI requirements:

* add asset
* edit asset
* delete asset with cascade warning
* reorder assets
* dependency picker
* criticality chip
* library suggestion drawer
* anomaly warning chip if enabled
* mobile card layout
* desktop table/detail split view

Important: This is the master list for assets. Other sections derive from this.

⸻

Section 4: Threat Assessment

Design a threat table/list.

Each threat includes:

* threat classification
* general threat history
* facility-specific threat history
* threat capability and intent
* threat rating

UI requirements:

* default 8 threats preloaded
* admin-configured threat list
* editable rows for Author in Draft
* rating chips
* mobile card view
* desktop table view
* read-only mode for Reviewer/Approver/HQ

⸻

Section 5: Asset Attractiveness Cross-Reference

This is one of the hardest UI areas.

Design a responsive Asset × Threat matrix.

Rows = assets from Section 3
Columns = threats from Section 4
Cells = ticked/unticked boolean showing whether the threat applies to the asset.

UI requirements:

* mobile-first matrix design
* avoid impossible horizontal scrolling where possible
* allow threat-by-threat mobile cards
* show asset row and threat column clearly
* allow quick tick/untick
* show evaluation status for ticked cells
* prompt to create Section 6 evaluation from a ticked cell
* show warnings when deleting source asset/threat
* support large grids up to 50 assets × 8 threats
* use virtualization or grouped views for scale

Suggested mobile pattern:

* select threat tab/dropdown
* show assets as cards with toggle
* show “Evaluation created / missing” chip

Suggested desktop pattern:

* sticky first column
* sticky header row
* heatmap/grid style
* filters by asset type, threat, rating, evaluation status

⸻

Section 6: Vulnerability Assessment & Risk Treatment

This is the main analytical workspace.

Each Evaluation includes:

* asset
* threat classification
* risk scenario
* consequences of risk scenario
* existing mitigation / controls
* vulnerabilities
* R1 pre-mitigation risk rating
* proposed mitigation
* R2 post-mitigation risk rating

R1 and R2 are calculated from:

* consequence severity
* likelihood
* configurable risk matrix

Design:

* evaluation list
* evaluation detail editor
* risk rating chips
* mini risk matrix visualization
* library suggestions
* AI smart tags if enabled
* anomaly detection warnings if enabled
* Reviewer comments attached to fields
* field lock controls for Reviewer

Mobile design should use a detail panel or full-screen editor rather than dense tables.

Desktop design can use table + side panel.

⸻

Section 7: Proposed Mitigation

This section is auto-populated from Section 6 proposed mitigations.

Each mitigation includes:

* mitigation description
* severity derived from R1
* agreed status: Yes / No / Pending
* owner
* target date
* comment / interim mitigation / reason for non-agreement
* post-approval status: Open / In Progress / Done
* progress log

Pre-approval:

* Author can edit description, agreed status, owner, target date, comment
* severity is read-only
* status/progress is not active yet

Post-approval:

* assessment content locked
* Mitigation Owner updates progress from My Mitigations dashboard only
* Section 7 shows read-only progress preview

Design requirements:

* mitigation table/cards
* severity chip
* agreed status chip
* owner picker from Mitigation Owner Pool
* target date with overdue indicator
* latest progress note preview
* “show full log” expandable area
* read-only progress timeline
* clear message explaining that progress updates happen in My Mitigations

⸻

Section 8: Conclusion

Design:

* rich text editor
* save/autosave
* AI draft button if enabled
* edit history
* validation state

Similar to Section 1.

⸻

Section 9: Appendices

Design three sub-tabs.

9A. SRA Team Members

Part 1: Document approvals

Rows:

* Author
* Reviewer
* Approver

Show:

* assigned person
* role
* signature timestamp
* status
* dual-role acknowledgement marker if applicable

Lead Author reassignment should be a controlled modal, not inline edit.

Part 2: Contributors

Fields:

* team member type
* full name
* position
* area of expertise
* company/function

UX:

* autocomplete from historical contributor directory
* add new contributor
* edit contributor for this assessment only
* remove contributor
* make clear contributors do not have login access

9B. References

Fields:

* description
* attachment or link

UX:

* upload file
* add URL
* show file type
* show upload status
* preview where possible

9C. Risk Assessment Matrix Appendix

Read-only matrix.

Show:

* likelihood across top
* consequence severity down side
* risk band cells
* consequence axes such as People, Assets, Environment, Reputation
* frozen configuration if assessment is approved

⸻

10. My Mitigations Workflow

Design a separate role-specific experience for Mitigation Owners.

My Mitigations Dashboard

Show:

* page title
* identity pill
* KPI cards:
    * Open
    * In Progress
    * Overdue
    * Done this year
* pending assignments banner
* assigned mitigation list/table

Each mitigation row/card:

* mitigation description
* asset × threat source
* facility/cycle
* severity
* target date
* overdue indicator
* current status
* last update
* log count
* assessment state
* action button: Update or View

Mitigation Detail Panel

Use a full-screen detail panel on mobile.

Header:

* mitigation description
* facility
* cycle
* severity
* target date
* assigned by
* current status

If assessment is Approved:

* status dropdown
* progress note textarea
* contextual save button:
    * Add note
    * Update status
    * Mark as Done
* note required when moving to Done
* Done is terminal
* progress timeline

If assessment is not Approved:

* read-only banner
* no update controls
* explain that updates are available after approval

⸻

11. Review and Approval UX

Reviewer experience

When assessment is In Review:

* show reviewer action panel
* allow section/field comments
* allow field locking
* show comment count
* show locked fields
* allow “Mark review complete”
* allow “Send back to Author”

Send-back modal:

* mandatory reason
* preview recipient
* confirmation
* amber outcome banner for Author

Approver experience

When assessment is Awaiting Approval:

Decision panel with three actions:

1. Approve
2. Send back to Reviewer
3. Reject to Draft

Approve modal:

* optional note
* confirm approval
* show that version will be frozen

Send back modal:

* mandatory reason
* clears Reviewer signature

Reject modal:

* mandatory reason
* clears all signatures
* red warning style

If dual-role policy is Warn:

* show acknowledgement modal before approval
* record acknowledgement visually in Document Approvals

⸻

12. Field Mode / Offline UX

Vantage must support a field mode for low-connectivity environments.

Field mode is not mobile-only. It must work on:

* phones
* tablets
* laptops
* desktop-installed PWA

Design Field Mode around per-section checkout.

Field Mode Screens

1. Field Mode landing screen
2. Select assessment
3. Choose checkout scope
4. Confirm offline package
5. Offline access pre-authorisation
6. Offline mode workspace
7. Sync queue
8. Sync success
9. Sync conflict prevention / locked record messaging
10. Offline cache wipe / failed auth warning

Checkout scope

User selects what to take offline:

* entire section
* specific evaluation records
* specific asset/threat domains
* attachments/photos where relevant

Once checked out:

* records are locked online
* other users see “checked out by [name]”
* field user can edit offline
* non-checked-out records are read-only

Offline auth

Design Settings → Offline Access flow:

Inputs:

* offline window: 1, 3, 5, or 7 days
* PIN or biometric
* confirmation

Offline sign-in:

* show user identifier
* PIN or biometric prompt
* offline mode banner
* failed attempt warning
* cache wipe after configured failures

Offline mode banner

Persistent banner:

“You’re working offline. Changes will sync when you reconnect.”

Graceful offline fallback

If user loses connectivity without field mode:

* show offline warning
* make forms read-only
* allow navigation/read-only review
* do not queue edits

The spec requires offline auth to avoid caching the full password and instead use PIN/biometric plus a server-signed offline token.  ￼

⸻

13. Admin Area

Design an Admin module with these tabs/screens:

Admin Overview

Cards for:

* facility setup
* user count
* role coverage
* MFA status
* active assessment teams
* risk matrix status
* libraries
* notification triggers
* export template
* audit log access

Platform Configuration

Subsections:

* risk matrix
* consequence axes
* risk band thresholds
* threat classifications
* asset criticality levels
* dual-role policy

Library Management

Five tabs:

1. Scenarios
2. Mitigations
3. Vulnerabilities
4. Controls
5. Consequences

Each has:

* searchable table
* add/edit/delete
* tags
* usage count

Notifications

Triggers table:

* active toggle
* event
* recipients
* escalation rule

Default triggers:

1. Assessment submitted
2. Review complete
3. Approved
4. Mitigation overdue
5. Comments added
6. Lock applied
7. AI flag raised
8. Version created

Export Template

Show:

* active standard SRA template
* section binding table
* document approvals mapping
* version control mapping
* disabled custom template upload placeholder

Users & Roles

Table:

* name
* email
* roles
* facility access
* MFA status
* last sign-in

Actions:

* add user
* edit user
* disable/delete user
* role assignment
* facility assignment

MFA Policy

Per-role toggles:

* Author
* Reviewer
* Approver
* HQ Executive
* Admin
* Mitigation Owner

Default Assessment Teams

Map facility to default:

* Author
* Reviewer
* Approver

Mitigation Owner Pool

Map role labels to users.

Examples:

* Security Manager → User A
* IT Director → User B
* Operations Lead → User C

When mapping changes, open mitigations transfer to new role-holder.

⸻

14. Audit Log and Version History

Design audit as a trusted governance feature.

Audit Log Viewer

Filters:

* facility
* assessment
* user
* role
* action type
* date range
* section
* field
* workflow event
* AI event
* offline event
* lock event

Each audit entry shows:

* timestamp
* user
* acting role
* facility
* assessment
* action
* before/after summary where appropriate
* source device/IP where relevant

Admin must enter a reason before viewing sensitive facility-specific logs.

Version History

Show:

* approved versions
* approval date
* author/reviewer/approver
* configuration snapshot
* export links
* compare versions action

Version Compare

Side-by-side view:

* changed sections
* changed risk ratings
* changed mitigations
* changed comments
* changed approvals

⸻

15. AI Features UX

AI is optional and feature-gated.

Do not make AI feel magical or uncontrolled. It should feel like a drafting assistant.

Design UI affordances for:

AI Drafted Summary

Available in Sections 1 and 8.

Flow:

* Generate Draft
* show preview
* allow edit before save
* show AI disclosure
* audit log event

Anomaly Detection

Inline warnings:

* risk rating inconsistency
* mitigation does not address vulnerability
* scenario mismatch with threat
* low criticality but severe consequence language

Allow Author to acknowledge:

* Not applicable
* False positive
* Will address
* Other

Smart Tagging

After saving risk scenario:

* show AI-suggested tags
* allow keep/remove/add
* confirm tags
* mark as AI-suggested until confirmed

Important: Mitigation Owners should not see AI features.

⸻

16. Notifications

Design in-platform notification center.

Notification types:

* assessment submitted
* review complete
* approved
* mitigation overdue
* comments added
* lock applied
* AI flag raised
* version created
* mitigation marked done
* inherited mitigations
* send-back/rejection received

Notification UX:

* bell icon
* unread count
* grouped by assessment/facility
* deep link to relevant screen
* mark read
* priority styling for overdue/rejection

⸻

17. Export UX

Design export flow for Word/PDF.

Export screen should show:

* assessment version
* export format: Word/PDF
* included sections
* document approvals
* version control
* appendices
* frozen risk matrix
* export status
* download link
* audit log entry confirmation

Approved assessments should export as locked/frozen versions.

Draft exports may be watermarked as Draft.

⸻

18. Visual Design Direction

Use a clean enterprise design system.

Suggested tone:

* calm
* trustworthy
* secure
* minimal
* not flashy
* operationally serious

Suggested visual language:

* navy / slate / graphite base
* restrained accent colour
* risk colours used only for risk/status meaning
* strong typography hierarchy
* clear cards
* sticky headers
* accessible contrast
* large touch targets
* plain-language labels

Avoid:

* overly playful UI
* consumer-app styling
* cluttered tables on mobile
* hidden critical workflow actions
* making disabled items look available
* using colour alone to communicate risk

⸻

19. Responsive Design Requirements

Mobile-first does not mean simplified functionality. It means the core flows must be usable on mobile.

Mobile patterns

Use:

* cards instead of dense tables
* full-screen panels instead of small modals
* sticky bottom action bars
* collapsible filters
* section jump menus
* progressive disclosure
* large tap targets
* readable form layouts

Desktop patterns

Use:

* data tables
* split panes
* side panels
* persistent navigation
* matrix/grid views
* bulk actions where appropriate

⸻

20. Key Screens to Produce

Create wireframes / high-fidelity screens for at least:

1. Sign in
2. MFA challenge
3. Role switcher
4. Author dashboard
5. Reviewer dashboard
6. Approver dashboard
7. HQ Executive dashboard
8. Admin dashboard
9. Mitigation Owner dashboard
10. Assessment list
11. Create new assessment
12. Clone previous assessment
13. Assessment workspace shell
14. Section 1 Executive Summary
15. Section 2 Facility Information
16. Section 3 Asset Disaggregation
17. Section 4 Threat Assessment
18. Section 5 Asset × Threat matrix
19. Section 6 Evaluation list
20. Section 6 Evaluation detail editor
21. Section 7 Mitigation list
22. Section 7 Progress log read-only view
23. Section 8 Conclusion
24. Section 9 Appendices
25. Reviewer comment and lock panel
26. Reviewer send-back modal
27. Approver decision panel
28. Approval modal
29. Reject modal
30. My Mitigation detail panel
31. Field Mode checkout flow
32. Offline sign-in
33. Offline workspace
34. Sync queue
35. Admin user management
36. Admin risk matrix configuration
37. Admin library management
38. Admin notification configuration
39. Audit log viewer
40. Version comparison
41. Export flow
42. Notification center

⸻

21. Critical UX Principles

Follow these principles:

1. Role clarity

Users should always know:

* who they are acting as
* what facility they are in
* what assessment state they are viewing
* what actions they can take
* what actions are unavailable and why

2. Workflow confidence

Users should never wonder:

* whether something saved
* whether an assessment was submitted
* whether a review is complete
* whether approval is final
* whether a mitigation can be updated

3. Audit defensibility

Design should visibly support governance:

* timestamps
* signatures
* locked fields
* immutable progress logs
* version history
* approval trail
* audit log access

4. Mobile-first complexity management

Do not remove complexity. Organize it.

Use:

* step-based flows
* focused screens
* expandable details
* smart defaults
* clear hierarchy

5. Field reliability

Offline mode must feel deliberate and safe, not accidental.

Show:

* what is checked out
* what is locked
* what is pending sync
* what has synced
* what cannot be edited offline

6. Mitigation Owner simplicity

Mitigation Owners should have the simplest UI in the product.

They should only see:

* their assigned mitigations
* update status
* add progress note
* progress history

Nothing else.

⸻

22. Deliverables Expected from the UI/UX Agent

Produce:

1. Product information architecture
2. Role-based navigation model
3. Complete screen inventory
4. Mobile-first wireframes
5. Desktop/tablet responsive layouts
6. User flows for all six roles
7. State-based assessment workflow diagrams
8. Section-by-section assessment UI
9. Mitigation Owner workflow
10. Field Mode / offline workflow
11. Admin configuration screens
12. Audit/version/export screens
13. Design system recommendations
14. Component list
15. Interaction rules
16. Empty states, loading states, error states
17. Accessibility considerations
18. Handoff notes for developers

⸻

23. Design System Component List

Create reusable components for:

* App shell
* Facility selector
* Role switcher
* State chip
* Risk chip
* Severity chip
* Status chip
* Assessment card
* Section progress rail
* Section completion indicator
* Validation summary
* Comment thread
* Field lock indicator
* Audit history popover
* AI suggestion card
* Anomaly warning chip
* Library suggestion drawer
* Risk matrix mini-view
* Asset card
* Threat card
* Evaluation card
* Mitigation card
* Progress timeline
* Approval decision panel
* Send-back/reject modal
* Offline banner
* Checkout scope selector
* Sync queue item
* Notification item
* Admin configuration table
* User role table
* Export status card
* Version comparison row

⸻

24. Important Open Questions to Flag in the Design

The UI/UX agent should flag these as product decisions, not block the design:

1. Whether “Author” and “Lead Author” are separate roles or Lead Author is simply the assigned Author for an assessment.
2. Whether Section 2 fields should be free text or configurable dropdowns.
3. Whether Section 3 “Asset Type” should be visible in the standard export or internal-only.
4. Whether HQ Executives can leave assessment-level comments for Approvers.
5. Whether dual-role policy is per-operator or per-facility.
6. Exact semantics of Withdraw / Recall actions.
7. Attachment storage limits and supported file types.
8. Clone semantics for mitigation status, progress logs, attachments, and changed matrix configuration.
9. Whether custom export templates are in v1 or future add-on only.

Design the interface so these can be toggled/configured later.

⸻

25. Final Instruction to the UI/UX Agent

Design Vantage as a serious enterprise workflow product, not a generic dashboard.

The heart of the product is the assessment workspace, especially Sections 3–7:

* Section 3 defines assets.
* Section 4 defines threats.
* Section 5 links assets to threats.
* Section 6 evaluates risk.
* Section 7 turns proposed mitigations into tracked action items.

The UI should make that relationship obvious.

The user should always understand:

* what they are assessing
* what state the assessment is in
* what their role allows them to do
* what is locked
* what needs action
* what changed
* what is ready for review or approval
* what mitigations remain open after approval

Prioritize clarity, trust, auditability, and field usability over visual novelty.