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

// --- Child entities (Sections 3/4/5/6) --------------------------------------
// The server models a lean row + a free-form JSONB bag for the demo-rich fields
// the columns don't cover (assets/threats: `details`; evaluations: `r1`/`r2`).
// These adapters UNPACK that canonical mapping back into the flat client shape.
// The write flip must pack the same way — see
// docs/decisions/2026-07-04-content-entity-field-mapping.md.

// Asset row → client asset. `asset_type` column → `type`; `details` carries the
// narrative fields (description/dependencies/consequences) plus any client-only
// advisory state (e.g. AD-1 `anomalyAcks`), which we spread through untouched.
export function toClientAsset(server) {
  if (!server) return null;
  const { type, description, dependencies, consequences, ...restDetails } = server.details || {};
  return {
    ...restDetails,
    id: server.id,
    name: server.name,
    type: server.assetType ?? type ?? "",
    criticality: server.criticality ?? "",
    description: description ?? "",
    dependencies: dependencies ?? "",
    consequences: consequences ?? ""
  };
}

// Threat row → client threat. `name` is the column; everything the UI shows
// (short label, classification, history, capability/intent, rating) lives in
// `details`. `likelihood` (int column) is not surfaced by the demo UI, which
// keys off the `rating` string instead.
export function toClientThreat(server) {
  if (!server) return null;
  const { short, classification, history, facilityHistory, capabilityIntent, rating, ...restDetails } =
    server.details || {};
  return {
    ...restDetails,
    id: server.id,
    name: server.name,
    short: short ?? server.name ?? "",
    classification: classification ?? "",
    history: history ?? "",
    facilityHistory: facilityHistory ?? "",
    capabilityIntent: capabilityIntent ?? "",
    rating: rating ?? ""
  };
}

// Evaluation row → client evaluation. `controls` column → `existingControls`;
// the pre/post risk pairs live in the `r1`/`r2` JSONB bags as
// { consequence, likelihood }. The demo also carries mirror score fields
// (consequenceScore/…); we derive them from the same numbers so the existing
// UI renders without them present on the server row.
export function toClientEvaluation(server) {
  if (!server) return null;
  const r1 = server.r1 || {};
  const r2 = server.r2 || {};
  const consequenceR1 = r1.consequence ?? null;
  const likelihoodR1 = r1.likelihood ?? null;
  const consequenceR2 = r2.consequence ?? null;
  const likelihoodR2 = r2.likelihood ?? null;
  return {
    id: server.id,
    assetId: server.assetId,
    threatId: server.threatId,
    scenario: server.scenario ?? "",
    consequences: r1.consequences ?? "",
    existingControls: server.controls ?? "",
    vulnerabilities: server.vulnerabilities ?? "",
    proposedMitigation: server.proposedMitigation ?? "",
    consequenceR1,
    likelihoodR1,
    consequenceR2,
    likelihoodR2,
    consequenceScore: consequenceR1,
    likelihoodScore: likelihoodR1,
    postConsequenceScore: consequenceR2,
    postLikelihoodScore: likelihoodR2
  };
}

// Server links ([{ assetId, threatId, enabled }]) → the client's two parallel
// representations: the flat `{ assetId, threatId }` presence list (enabled only)
// and the `matrix` map keyed "assetId|threatId". Disabled links are omitted from
// both, matching the demo where an absent pair means "not linked".
export function toClientLinks(serverLinks = []) {
  const enabled = serverLinks.filter((link) => link.enabled);
  const links = enabled.map(({ assetId, threatId }) => ({ assetId, threatId }));
  const matrix = {};
  enabled.forEach(({ assetId, threatId }) => {
    matrix[`${assetId}|${threatId}`] = true;
  });
  return { links, matrix };
}

// --- Write adapters (the inverse of the read adapters above) -----------------
// PACK a flat client entity into the server's { columns…, jsonb bag } payload,
// per docs/decisions/2026-07-04-content-entity-field-mapping.md. Used ONLY by the
// prod write seam in WorkspaceContext; demo never calls these.

// Client asset → POST/PATCH /assets body (minus lockVersion, which the seam adds).
// `id` is dropped (server-assigned / in the URL). Everything that isn't a column
// (description/dependencies/consequences + any client-only key like anomalyAcks)
// goes into `details`.
export function toServerAssetPayload(asset) {
  const { id, name, type, criticality, description, dependencies, consequences, ...rest } = asset;
  return {
    name,
    assetType: type ?? null,
    criticality: criticality ?? null,
    details: {
      description: description ?? "",
      dependencies: dependencies ?? "",
      consequences: consequences ?? "",
      ...rest
    }
  };
}

// Client threat → POST/PATCH /threats body. `name` is the column (falls back to
// classification for a freshly-added threat, which has no separate name); the
// demo-rich fields + any client-only key go into `details`. `likelihood` (int
// column) is not surfaced by the UI, so it is left unset.
export function toServerThreatPayload(threat) {
  const { id, name, short, classification, history, facilityHistory, capabilityIntent, rating, ...rest } = threat;
  return {
    name: name ?? classification ?? "Threat",
    details: {
      short: short ?? "",
      classification: classification ?? "",
      history: history ?? "",
      facilityHistory: facilityHistory ?? "",
      capabilityIntent: capabilityIntent ?? "",
      rating: rating ?? "",
      ...rest
    }
  };
}

// Client evaluation → PATCH /evaluations/:id body. `existingControls`→`controls`
// column; the R1/R2 pairs go into the r1/r2 jsonb as { consequence, likelihood };
// the scenario-consequence text has no column, so it rides r1.consequences
// (matching the read adapter). Mirror score fields are pure projections and not
// sent.
export function toServerEvaluationPayload(ev) {
  return {
    scenario: ev.scenario ?? "",
    controls: ev.existingControls ?? "",
    vulnerabilities: ev.vulnerabilities ?? "",
    proposedMitigation: ev.proposedMitigation ?? "",
    r1: { consequence: ev.consequenceR1 ?? null, likelihood: ev.likelihoodR1 ?? null, consequences: ev.consequences ?? "" },
    r2: { consequence: ev.consequenceR2 ?? null, likelihood: ev.likelihoodR2 ?? null }
  };
}

// --- §2 Facility Information (structured form) -------------------------------
// §2 is a structured form, not a single narrative blob. Per the 2026-07-04
// sign-off it serializes to JSON and rides the existing `content_text` column via
// PUT /sections/2 (no new server model in v1). parse() merges the stored object
// over the caller's defaults so a form field added later still has a default, and
// tolerates a legacy plain-text value (returns defaults) instead of throwing.
export function serializeFacilityInfo(data) {
  return JSON.stringify(data);
}

export function parseFacilityInfo(text, fallback = {}) {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : fallback;
  } catch {
    return fallback;
  }
}

// Server library entry (from GET /api/library/search) → the LibraryModal picker
// shape { id, text, tags }. The modal renders `text` and `tags` and reports a
// similarity score; `body` is the prose that was embedded, so it maps to `text`.
export function toLibraryPickerEntry(server) {
  return {
    id: server.id,
    text: server.body || server.title || "",
    tags: (server.metadata && server.metadata.tags) || [],
    similarity: server.similarity
  };
}
