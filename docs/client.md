# Vorge Client Architecture

## Overview

The Vorge client is a mobile-first React/Vite/Tailwind application. It renders role-aware workflows for Security Risk Assessments while treating the server as the authority for permissions, facility access, state transitions, validation, and audit-triggering actions.

## Routing

Routes:

- `/login`
- `/dashboard` (role-aware)
- `/assessments`
- `/assessments/:assessmentId/sections/:sectionId`
- `/mitigations` (Mitigation Owner only)
- `/admin` (Admin only)
- `/audit`
- `/field-mode`
- `/notifications`

Protected routes redirect unauthenticated users. Role-restricted routes redirect users whose acting role is not permitted to the role's home route.

## UI Layout System

The app uses:

- `AppShell` — sticky sidebar (desktop), top bar with notifications and profile menu, bottom navigation (mobile), role switcher, facility selector.
- `AssessmentShell` — sticky header with state chip and workflow actions, send-back / advance read-only banners, section rail with completion + comment + validation badges, content area, optional contextual panels per section.
- `MobileShell` — used by simple pages for sticky mobile actions and compact layout.

## Component Structure

Reusable design-system components live under `src/components/`:

- `Chip` (StateChip, RiskChip, SeverityChip, StatusChip, AgreedChip, RoleChip)
- `Card` (Card, CardHeader, CardSection)
- `KpiCard`
- `Banner` (info / warn / danger / success / neutral)
- `Modal`, `Tabs`, `Avatar`, `EmptyState`, `PageHeader`
- `FormField` (TextInput, TextArea, Select)
- `Icon` (inline SVG set)

Feature modules (`src/features/`):

- `assessmentWorkspace` — state machine, risk matrix, per-section UI components.
- `mitigationOwner` — status validation, KPI calculation.
- `fieldMode` — offline messaging and online-only feature list.
- `navigation` — role-aware navigation map.
- `notifications` — role-filtered inbox model.

Demo data fixtures (`src/data/`) drive the navigable UI: operators, facilities, users, assets, threats, asset×threat links, evaluations, mitigations, assessments, audit log, notifications.

## State Management

The first pass uses React context for auth/session, acting role, and facility selection. Server-state fetching is centralized through `api/client.js` and can be upgraded to a caching library when wired to live endpoints.

## Role-Based Rendering

Navigation, dashboards, workflow action panels, and section editors all branch on the acting role. Server permissions and workflow states remain authoritative; the UI is a layer of convenience.

## Mobile-First Design Decisions

The UI uses card-first layouts, responsive grids, sticky mobile actions, bottom navigation, accessible tap targets, and progressive disclosure. Section 5 supports both grid and "by threat" mobile presentations. Larger grids should adopt virtualization as data scale grows.

## Form Strategy

Forms use shared field components, accessible labels, validation summaries, and contextual helper text. Client validation prevents obvious mistakes; server validation is final.

## API Integration

`api/client.js` centralizes base URL, JWT headers, acting-role headers, JSON parsing, and normalized API errors. The current pages render demo fixtures so the UI is navigable without a server.

## Accessibility Considerations

Semantic headings, labels, keyboard-accessible controls, visible focus styles, non-color-only statuses, and accessible alert regions for validation errors. A skip-link jumps to main content on every page.

## Testing

Client tests cover session helpers, navigation map, protected routes, assessment state and read-only logic, workflow actions, risk matrix calculations, mitigation rules and KPIs, offline messaging, and notification model. Coverage gate is 80% on auth, features, and routes; current coverage exceeds 95%.

## Known Limitations

- Server integration is foundation-level pending the full server contract; UI uses demo fixtures.
- Full offline editing / sync is illustrative only.
- Section 5 virtualization is planned for large asset/threat grids.
