// §Guest read-only access · G3 — the single source of truth for "every mutating
// route a Guest must be denied on." Two tests consume it:
//   - guestDenyCoverage.test.js (unit): set-equality vs the live router, so a NEW
//     non-GET data route that isn't listed here FAILS CI (the tripwire).
//   - integration/guestWriteDenial.test.js: drives each entry as the fixture
//     guest with a VALID payload and asserts the exact status+code.
//
// `path` is the Express route template EXACTLY as mounted (param names matter —
// set-equality compares these strings). `url(ctx)` / `body(ctx)` build the
// concrete request from a fixture context. `expect` is the deny the guest must
// receive; most are 403 ROLE_NOT_ALLOWED, with two documented exceptions:
//   - switch-role → 403 ROLE_NOT_ASSIGNED (guest holds no other role assignment)
//   - mitigations/:id/log → 404 MITIGATION_NOT_FOUND (scoped getter returns null
//     for any non-Mitigation-Owner; there is no role-403 on this route by design)
//
// Payloads are valid so the request reaches the role gate rather than dying at a
// Zod 400. Where a guard runs BEFORE validation (authorizeRole on library,
// rejectGuest on AI, requireHqExecutive after validation on flags) the body is
// still valid, for robustness against guard reordering.

const GUEST_DENY_MANIFEST = [
  // --- assessment content writes (contentWriteGuard → Author-only 403) --------
  // Target is the guest's in-scope assessment (IN_REVIEW). runContentMutation
  // checks role BEFORE state/lockVersion, so the guest hits 403 (not 409/404).
  {
    path: "/api/assessments/:assessmentId/assets",
    method: "POST",
    family: "assets",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/assets`,
    body: () => ({ lockVersion: 0, name: "Guest should not create this" })
  },
  {
    path: "/api/assessments/:assessmentId/assets/:assetId",
    method: "PATCH",
    family: "assets",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/assets/${c.asset}`,
    body: () => ({ lockVersion: 0, name: "Guest rename attempt" }),
    unchanged: (c) => ({ table: "assets", id: c.asset }) // representative for G-I12
  },
  {
    path: "/api/assessments/:assessmentId/assets/:assetId",
    method: "DELETE",
    family: "assets",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/assets/${c.asset}`,
    body: () => ({ lockVersion: 0 })
  },
  {
    path: "/api/assessments/:assessmentId/threats",
    method: "POST",
    family: "threats",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/threats`,
    body: () => ({ lockVersion: 0, name: "Guest should not create this" })
  },
  {
    path: "/api/assessments/:assessmentId/threats/:threatId",
    method: "PATCH",
    family: "threats",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/threats/${c.threat}`,
    body: () => ({ lockVersion: 0, likelihood: 5 })
  },
  {
    path: "/api/assessments/:assessmentId/threats/:threatId",
    method: "DELETE",
    family: "threats",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/threats/${c.threat}`,
    body: () => ({ lockVersion: 0 })
  },
  {
    path: "/api/assessments/:assessmentId/links/:assetId/:threatId",
    method: "PUT",
    family: "links",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/links/${c.asset}/${c.threat}`,
    body: () => ({ lockVersion: 0, enabled: true })
  },
  {
    path: "/api/assessments/:assessmentId/evaluations/:evaluationId",
    method: "PATCH",
    family: "evaluations",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/evaluations/${c.evaluation}`,
    body: () => ({ lockVersion: 0, scenario: "Guest edit attempt" })
  },
  {
    path: "/api/assessments/:assessmentId/contributors",
    method: "PUT",
    family: "contributors",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/contributors`,
    body: () => ({ lockVersion: 0, contributors: [{ name: "Guest", role: "Intruder" }] })
  },
  {
    path: "/api/assessments/:assessmentId/sections/:n",
    method: "PUT",
    family: "sections",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/sections/1`,
    body: () => ({ lockVersion: 0, contentText: "Guest edit attempt" })
  },
  {
    path: "/api/assessments/:assessmentId/lead-author",
    method: "PUT",
    family: "lead-author",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/lead-author`,
    body: (c) => ({ lockVersion: 0, leadAuthorUserId: c.leadAuthorUserId, reason: "guest handover attempt" })
  },
  {
    path: "/api/assessments/:assessmentId/mitigations/:mitigationId/owner",
    method: "PUT",
    family: "mitigations-owner",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/mitigations/${c.mitigation}/owner`,
    body: () => ({ lockVersion: 0, ownerRoleLabel: "Guest pool" })
  },

  // --- workflow (state machine → role checked AFTER state) --------------------
  // complete_review is valid FROM the IN_REVIEW fixture state, so the state gate
  // passes and the guest hits the role 403 (not a 409).
  {
    path: "/api/assessments/:assessmentId/workflow",
    method: "POST",
    family: "workflow",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/workflow`,
    body: () => ({ action: "complete_review" })
  },

  // --- consistency flags (requireHqExecutive → 403 before the scoped 404) -----
  {
    path: "/api/assessments/consistency-flags/:flagId",
    method: "PATCH",
    family: "consistency-flags",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/consistency-flags/${c.anyUuid}`,
    body: () => ({ status: "sent_back" })
  },

  // --- AI endpoints (rejectGuest, mounted before validateRequest AND the
  // env.aiEnabled check → 403 regardless of body or AI flag) -------------------
  {
    path: "/api/assessments/:assessmentId/evaluations/:evaluationId/suggest-tags",
    method: "POST",
    family: "ai",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/evaluations/${c.evaluation}/suggest-tags`,
    body: () => ({})
  },
  {
    path: "/api/assessments/:assessmentId/evaluations/:evaluationId/tags/confirm",
    method: "POST",
    family: "ai",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/evaluations/${c.evaluation}/tags/confirm`,
    body: () => ({ tags: [] })
  },
  {
    path: "/api/assessments/:assessmentId/sections/:n/generate-draft",
    method: "POST",
    family: "ai",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/sections/1/generate-draft`,
    body: () => ({})
  },
  {
    path: "/api/assessments/:assessmentId/anomaly-check",
    method: "POST",
    family: "ai",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/anomaly-check`,
    body: () => ({})
  },
  {
    path: "/api/assessments/:assessmentId/anomaly-acknowledgements",
    method: "POST",
    family: "ai",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/assessments/${c.assessment}/anomaly-acknowledgements`,
    body: (c) => ({ ruleKey: "asset-criticality-consequences", entityType: "asset", entityId: c.asset, reason: "false_positive" })
  },

  // --- mitigations progress log (scoped getter → 404, NOT a role 403) ---------
  {
    path: "/api/mitigations/:mitigationId/log",
    method: "POST",
    family: "mitigations-log",
    expect: { status: 404, code: "MITIGATION_NOT_FOUND" },
    url: (c) => `/api/mitigations/${c.mitigation}/log`,
    body: () => ({ nextStatus: "In Progress", note: "guest attempt" })
  },

  // --- library admin CRUD (authorizeRole(ADMIN) → 403 before validation) ------
  {
    path: "/api/library/",
    method: "POST",
    family: "library",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: () => "/api/library",
    body: (c) => ({ facilityId: c.facilityId, type: "Scenarios", title: "Guest entry", body: "should not persist" })
  },
  {
    path: "/api/library/:id",
    method: "PUT",
    family: "library",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/library/${c.anyUuid}`,
    body: (c) => ({ facilityId: c.facilityId, title: "Guest edit" })
  },
  {
    path: "/api/library/:id",
    method: "DELETE",
    family: "library",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: (c) => `/api/library/${c.anyUuid}`,
    body: (c) => ({ facilityId: c.facilityId })
  },

  // --- auth mutating paths a guest must not use to escalate -------------------
  {
    path: "/api/auth/switch-role",
    method: "POST",
    family: "auth-switch-role",
    expect: { status: 403, code: "ROLE_NOT_ASSIGNED" },
    url: () => "/api/auth/switch-role",
    body: () => ({ role: "Author" })
  },
  {
    path: "/api/auth/mfa/enroll-start",
    method: "POST",
    family: "auth-mfa-enroll",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: () => "/api/auth/mfa/enroll-start",
    body: () => ({})
  },
  {
    path: "/api/auth/mfa/enroll-verify",
    method: "POST",
    family: "auth-mfa-enroll",
    expect: { status: 403, code: "ROLE_NOT_ALLOWED" },
    url: () => "/api/auth/mfa/enroll-verify",
    body: () => ({ code: "000000" })
  }
];

// The three /api/auth paths the manifest deliberately covers (the rest of the
// auth surface is legitimately guest-usable — see AUTH_ALLOWED in the coverage
// test). Kept here so the coverage test and the manifest can't drift.
const MANIFEST_AUTH_PATHS = GUEST_DENY_MANIFEST
  .filter((e) => e.path.startsWith("/api/auth/"))
  .map((e) => `${e.method} ${e.path}`);

module.exports = { GUEST_DENY_MANIFEST, MANIFEST_AUTH_PATHS };
