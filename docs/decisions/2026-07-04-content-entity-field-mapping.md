# Decision: canonical field mapping between the rich client shapes and the lean server rows (P3 (g) content-entity flip)

**Date:** 2026-07-04 · **Status:** ADOPTED (agent decision; low-risk, mechanical — surfaced here per the "implicit decisions explicit" rule) · **Phase:** P3 (g)

## Problem

The demo-era client fixtures (`client/src/data/{assets,threats,evaluations}.js`) carry many more fields than the server columns. The server (`202605020001_initial_schema`) models a lean row per entity plus a free-form JSONB bag for everything else (`assets.details`, `threats.details`, `evaluations.r1`/`r2`). To flip prod off fixtures onto live data, the client↔server field mapping must be fixed **once** and used identically by the read adapters (now) and the write adapters (next slice), or a round-trip would silently drop or relocate fields.

## Decision — the canonical mapping

Columns carry the fields the server already has; the JSONB bag carries the demo-rich remainder. Unknown keys in a bag are preserved (spread through) so nothing the UI added (e.g. AD-1 advisory `anomalyAcks`) is lost across a round-trip.

### Assets (Section 3)
| Client field | Server home |
|---|---|
| `name` | `name` column |
| `type` | `asset_type` column |
| `criticality` | `criticality` column |
| `description`, `dependencies`, `consequences` | `details` jsonb |
| any other client-only key (e.g. `anomalyAcks`) | `details` jsonb (spread through) |

### Threats (Section 4)
| Client field | Server home |
|---|---|
| `name` | `name` column |
| `short`, `classification`, `history`, `facilityHistory`, `capabilityIntent`, `rating` | `details` jsonb |
| `likelihood` (int column) | **not surfaced** — the demo UI keys off the `rating` string, not the int. Left null/untouched on reads; the write slice decides whether to derive it. |

### Asset×threat links (Section 5)
Server stores an explicit `enabled` boolean per pair. Client uses two parallel representations: a presence list `{ assetId, threatId }` and a `matrix` map keyed `"assetId|threatId"`. **Only `enabled: true` links map into both**; a disabled/absent pair means "not linked" in the demo, so it is omitted from both. (Write slice: unticking a matrix cell is a `PUT …/links` with `enabled: false`, not a delete.)

### Evaluations (Section 6)
| Client field | Server home |
|---|---|
| `scenario`, `vulnerabilities`, `proposedMitigation` | same-named columns |
| `existingControls` | `controls` column |
| `consequenceR1`, `likelihoodR1` | `r1` jsonb as `{ consequence, likelihood }` |
| `consequenceR2`, `likelihoodR2` | `r2` jsonb as `{ consequence, likelihood }` |
| `consequences` (scenario-consequence text) | `r1.consequences` (no dedicated column; parked in the r1 bag) |
| mirror score fields (`consequenceScore`, `postLikelihoodScore`, …) | **derived** from the R1/R2 numbers on read; never stored (they are pure projections). |

## Consequences / notes

- The read adapters live in `client/src/api/adapters.js` (`toClientAsset`/`toClientThreat`/`toClientEvaluation`/`toClientLinks`). The **write** adapters pack using the inverse of this table and **all landed 2026-07-04**: `toServerAssetPayload` (assets), `toServerThreatPayload` (threats), `toServerEvaluationPayload` (evaluations); links use `toggleMatrix`→`PUT /links` (enable/disable, not delete); contributors use a whole-list `PUT` (identity records). All wired through the prod↔demo seam in `WorkspaceContext` (local-optimistic per keystroke + blur/discrete persist, `stateRef` for fresh lockVersion, 409 reload). **Server gap:** evaluations have no create endpoint (PATCH only; link-enable doesn't seed one) — `persistEvaluation` guards on UUID ids so client stubs don't fire doomed PATCHes; persisting NEW evaluations needs a server create path (roadmap backlog).
- No server schema change is required — every rich field has a JSONB home. If a field later needs to be queried/indexed server-side it graduates to a real column via migration; until then the bag is authoritative.
- The demo path is unaffected: this mapping only runs in prod hydration/writes. Demo keeps the flat fixtures and fires no network.

## §2 Facility Information (structured form) — DECIDED 2026-07-04

Not one of the content entities above. **Decision (user sign-off 2026-07-04): serialize the structured form to JSON and store it in the existing section-2 `content_text` column** via the shipped `PUT /sections/:n` endpoint — no new server model in v1. Rationale: reuses the section-text endpoint/migration/guard/audit vocabulary with zero server work; §2 is a single-owner form where blob storage is adequate. A real column model can graduate later if server-side querying is ever needed. Implemented: `serializeFacilityInfo`/`parseFacilityInfo` in `adapters.js` + `FacilityInfoSection` init-from-parsed-JSON and save-on-blur through `saveSectionText(section 2)` (prod live PUT w/ lockVersion + 409 banner; demo no-fetch). `parseFacilityInfo` tolerates a legacy plain-text value (returns defaults) so it never throws on old data.
