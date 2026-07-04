// P3 · (g) reads — map the server's assessment shape onto the client's richer
// (demo-era) shape. The server is authoritative for id/name/facility/state/
// lockVersion/leadAuthor/contributors/section text; the demo-only DISPLAY fields
// the server doesn't model yet (cycle, per-section completion/validation, the
// "v0.7"-style version label) are defaulted/derived here so the existing UI
// renders without those fields present. Used ONLY in prod hydration; demo mode
// keeps its fixtures untouched.

// "… — 2026 SRA" → "2026". Falls back to empty when no year is present.
function deriveCycle(name) {
  const match = /(\d{4})/.exec(name || "");
  return match ? match[1] : "";
}

// Server assessment (from GET /api/assessments or the bundle's `assessment`) →
// client list/workspace assessment shape.
export function toClientAssessment(server) {
  if (!server) return null;
  return {
    id: server.id,
    name: server.name,
    facilityId: server.facilityId,
    facilityName: server.facilityName,
    operatorName: server.operatorName,
    state: server.state,
    lockVersion: server.lockVersion ?? server.version ?? 1,
    leadAuthorUserId: server.leadAuthorUserId,
    contributors: server.contributors || [],
    lastUpdated: server.lastUpdated || server.createdAt || null,
    // Demo-only display fields — defaults until the server models them.
    cycle: deriveCycle(server.name),
    completedSectionIds: [],
    sectionValidation: {},
    version: `v${server.lockVersion ?? 1}`
  };
}

// Bundle's sectionTexts ({ "1": "…", "2": "…", "8": "…" }) → the client's
// narrative fields on the assessment object.
export function applySectionTexts(assessment, sectionTexts = {}) {
  return {
    ...assessment,
    executiveSummary: sectionTexts["1"] ?? assessment.executiveSummary ?? "",
    facilityInfo: sectionTexts["2"] ?? assessment.facilityInfo ?? "",
    conclusion: sectionTexts["8"] ?? assessment.conclusion ?? ""
  };
}
