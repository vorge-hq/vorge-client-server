# Vorge Client Build Plan

This document references `plan.md`, `docs/BusinessLogic.md`, `docs/UIUX.md`, and `server-build-plan.md`.

## Frontend Architecture

The client is a React/Vite/Tailwind app with React Router, protected routes, role-aware navigation, mobile-first layouts, an assessment workspace covering all 9 sections, a Mitigation Owner experience, an Admin configuration surface, audit and field-mode pages, and a notifications inbox.

## Routing Model

Routes include login, role-aware dashboard, assessments list, assessment workspace (per section), mitigations (Mitigation Owner only), admin (Admin only), audit, field mode, and notifications. Route guards are UX helpers only; server permissions remain authoritative.

## Mobile-First Layout Strategy

Card-first lists, full-screen mobile panels, sticky bottom navigation, large tap targets, progressive disclosure, and section jump menu inside the assessment workspace. Desktop enhances with sidebar navigation, side panels, dense tables, and the asset×threat grid.

## Design System Strategy

Tailwind tokens cover Vorge navy/ink, risk band colors (Low/Medium/High/Very High), state colors (Draft/In Review/Awaiting Approval/Approved), and role tones. Reusable component primitives (Chip, Card, KpiCard, Banner, Modal, Tabs, FormField, EmptyState, PageHeader) live under `src/components/` and ship the same visual language to every screen.

## Role-Based Navigation Strategy

Navigation derives from acting role:

- Author: Home, Assessments, Tasks, Field Mode, Audit.
- Reviewer: Home (Review Queue), Assessments, Tasks, Audit.
- Approver: Home (Approval Queue), Assessments, Audit, Tasks.
- HQ Executive: Portfolio, Assessments, Audit Summary.
- Admin: Admin, Audit, Assessments.
- Mitigation Owner: My Mitigations, Tasks. (No Sections 1–9, Admin, or other dashboards.)

Mobile bottom nav exposes the most important 4 destinations per role.

## Page / Screen Inventory

- Auth: Sign in + MFA challenge + persona picker (demo).
- Dashboards: Author, Reviewer, Approver, HQ Executive, Admin (Mitigation Owner is redirected to My Mitigations).
- Assessments list with state, facility, and search filters.
- Assessment workspace with section rail, state banners, workflow action modals (submit, withdraw, mark complete, send back, approve, reject).
- Section components for all 9 sections including the Asset × Threat matrix and the R1/R2 evaluation editor.
- Mitigation Owner KPIs, list, and detail panel with status update + required Done note.
- Admin tabs: Users & Roles, Risk Matrix, Libraries, Notifications, Default Teams, Mitigation Pool, MFA Policy, Export Template.
- Audit log viewer with filters.
- Field Mode with checkout scope, offline pre-authorisation, sync queue.
- Notifications inbox.

## Dashboard Plan By Role

Dashboards summarise the acting role's queue, KPIs, and next actions. Mitigation Owner lands directly on My Mitigations; Admin lands in configuration overview.

## Assessment Workspace Plan

Workspace shows facility, assessment name, state, version, role-aware workflow actions, send-back banners (amber/red), advance read-only banners (Reviewer/Approver in Draft), section progress rail with per-section validation and comment counts, locked-field indicators, and per-role read-only enforcement.

## Sections 1-9 UI Plan

- Section 1 / 8 — rich-text narrative with optional AI draft.
- Section 2 — facility metadata form with configurable enums and "Other" fallback.
- Section 3 — asset cards with criticality chip, dependencies, consequences, library suggestions placeholder.
- Section 4 — threat table (desktop) and cards (mobile) with rating chips.
- Section 5 — Asset × Threat matrix with grid view and mobile "by threat" view.
- Section 6 — evaluation cards with R1/R2 chips computed from configurable matrix.
- Section 7 — mitigation cards with severity, agreed status, owner, target date, status chip, expandable progress log; pre-approval vs post-approval messaging.
- Section 9 — tabbed appendices: Team Members (Document Approvals + Contributors), References, Risk Matrix (current snapshot rendering).

## Mitigation Owner UI Plan

Mitigation Owner UI includes KPI cards (Open / In Progress / Overdue / Done this year), filter, mitigation list with severity, status, assessment-state, and overdue chips, and a detail modal with status dropdown, required Done note, append-only progress log, and read-only mode for non-Approved assessments.

## Admin UI Plan

Admin sits in tabbed configuration with Users & Roles, Risk Matrix, Libraries, Notifications, Default Teams, Mitigation Pool, MFA Policy, and Export Template tabs. Each tab is a self-contained read-only or simulated configuration surface backed by demo data until live endpoints are wired.

## Offline / Field Mode UI Plan

Field Mode page lets the user pick a checkout scope, simulate online/offline, choose offline window, and review the sync queue. Online-only features are explicitly listed (approvals, HQ dashboards, AI).

## Frontend Testing Plan

Vitest covers session, navigation, assessment state and workflow actions, risk matrix calculations, mitigation validation and KPIs, offline messaging, notification filtering and tone classes, and protected route gating. Coverage gate is 80% on auth, features, and routes.
