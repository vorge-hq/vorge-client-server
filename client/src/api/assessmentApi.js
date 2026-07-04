// P3 · (g) — typed client wrappers over the write/section API. Thin layer on top
// of apiRequest (which owns auth headers + refresh-retry). Every content mutation
// sends the `lockVersion` the client read; the caller maps a 409
// LOCK_VERSION_CONFLICT to the "modified by another user — reload" affordance.
//
// These are only called in PROD mode (VITE_ENABLE_DEMO !== "true"); demo mode
// stays on client/src/data fixtures and fires no request. The demo/prod branch
// lives in the WorkspaceContext seam, not here.
import { apiRequest, apiDownload } from "./client";

function mutate(path, method, body, actingRole) {
  return apiRequest(path, { method, actingRole, body: JSON.stringify(body) });
}

export function listAssessments(actingRole) {
  return apiRequest("/api/assessments", { actingRole });
}

export function getAssessmentBundle(assessmentId, actingRole) {
  return apiRequest(`/api/assessments/${assessmentId}`, { actingRole });
}

// --- Semantic library search (P4 O3) ----------------------------------------
// Embeds the query server-side and returns cosine-ranked entries (with a
// `similarity` score) scoped to the facility. PROD only — the demo/prod branch
// lives in the WorkspaceContext seam.
export function searchLibrary({ facilityId, q, type, actingRole }) {
  const params = new URLSearchParams({ facilityId, q });
  if (type) {
    params.set("type", type);
  }
  return apiRequest(`/api/library/search?${params.toString()}`, { actingRole });
}

// --- Section text (Sections 1/2/8) ------------------------------------------
export function putSection({ assessmentId, sectionNumber, contentText, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/sections/${sectionNumber}`, "PUT", { lockVersion, contentText }, actingRole);
}

// --- Assets ------------------------------------------------------------------
export function createAsset({ assessmentId, lockVersion, actingRole, ...asset }) {
  return mutate(`/api/assessments/${assessmentId}/assets`, "POST", { lockVersion, ...asset }, actingRole);
}
export function updateAsset({ assessmentId, assetId, lockVersion, actingRole, ...changes }) {
  return mutate(`/api/assessments/${assessmentId}/assets/${assetId}`, "PATCH", { lockVersion, ...changes }, actingRole);
}
export function deleteAsset({ assessmentId, assetId, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/assets/${assetId}`, "DELETE", { lockVersion }, actingRole);
}

// --- Threats -----------------------------------------------------------------
export function createThreat({ assessmentId, lockVersion, actingRole, ...threat }) {
  return mutate(`/api/assessments/${assessmentId}/threats`, "POST", { lockVersion, ...threat }, actingRole);
}
export function updateThreat({ assessmentId, threatId, lockVersion, actingRole, ...changes }) {
  return mutate(`/api/assessments/${assessmentId}/threats/${threatId}`, "PATCH", { lockVersion, ...changes }, actingRole);
}
export function deleteThreat({ assessmentId, threatId, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/threats/${threatId}`, "DELETE", { lockVersion }, actingRole);
}

// --- Asset×threat links (enable/disable) ------------------------------------
export function putLink({ assessmentId, assetId, threatId, enabled, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/links/${assetId}/${threatId}`, "PUT", { lockVersion, enabled }, actingRole);
}

// --- Evaluations -------------------------------------------------------------
export function updateEvaluation({ assessmentId, evaluationId, lockVersion, actingRole, ...changes }) {
  return mutate(`/api/assessments/${assessmentId}/evaluations/${evaluationId}`, "PATCH", { lockVersion, ...changes }, actingRole);
}

// --- Smart tagging (P4 O4, §9.6) --------------------------------------------
// Tags are advisory metadata that fire AFTER the scenario save, so these carry
// NO lockVersion (they never bump it). suggest-tags returns the AI-suggested
// set (out-of-vocab already discarded server-side); confirm persists the
// Author's final chosen set. PROD only — the demo/prod branch lives in the seam.
export function suggestTags({ assessmentId, evaluationId, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/evaluations/${evaluationId}/suggest-tags`, "POST", {}, actingRole);
}
export function getTags({ assessmentId, evaluationId, actingRole }) {
  return apiRequest(`/api/assessments/${assessmentId}/evaluations/${evaluationId}/tags`, { actingRole });
}
export function confirmTags({ assessmentId, evaluationId, tags, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/evaluations/${evaluationId}/tags/confirm`, "POST", { tags }, actingRole);
}

// --- Contributors ------------------------------------------------------------
export function putContributors({ assessmentId, contributors, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/contributors`, "PUT", { lockVersion, contributors }, actingRole);
}

// --- Workflow (submit / withdraw / recall / approve …) -----------------------
export function postWorkflow({ assessmentId, action, reason, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/workflow`, "POST", { action, reason, lockVersion }, actingRole);
}

// --- Lead Author reassignment (§5.5) ----------------------------------------
export function reassignLeadAuthor({ assessmentId, leadAuthorUserId, reason, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/lead-author`, "PUT", { lockVersion, leadAuthorUserId, reason }, actingRole);
}

// --- Mitigation owner assignment (§7) ---------------------------------------
export function assignMitigationOwner({ assessmentId, mitigationId, ownerUserId, ownerRoleLabel, lockVersion, actingRole }) {
  return mutate(`/api/assessments/${assessmentId}/mitigations/${mitigationId}/owner`, "PUT", { lockVersion, ownerUserId, ownerRoleLabel }, actingRole);
}

// --- Document export (§16) — binary download, not JSON ----------------------
// The formats the standard SRA template supports. Order = the order shown in the
// export chooser.
export const EXPORT_FORMATS = [
  { id: "docx", label: "Word (.docx)" },
  { id: "pdf", label: "PDF" }
];

// Resolves to { blob, filename }; the caller streams it to the browser. PROD
// only — the WorkspaceContext seam skips this entirely in demo mode.
export function exportAssessment({ assessmentId, format, actingRole }) {
  return apiDownload(`/api/assessments/${assessmentId}/export?format=${encodeURIComponent(format)}`, {
    actingRole
  });
}

// The exact user-facing copy for a lost optimistic-concurrency race. Exported so
// the UI and its tests share one source of truth (test-specs §P3 "Client flip":
// assert the copy exists, not the raw code).
export const CONFLICT_RELOAD_MESSAGE =
  "This assessment was modified by another user — reload to see the latest and try again.";

// True when an ApiError is a lost lock_version race.
export function isConflict(error) {
  return error?.status === 409 && error?.code === "LOCK_VERSION_CONFLICT";
}
