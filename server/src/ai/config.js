// P4 · O2 — per-feature model map + price table for the AI module.
//
// Model ids are gateway "provider/model" strings (see
// docs/decisions/2026-07-03-ai-gateway-ai-sdk.md). Each is env-overridable with
// NO code change, preserving §9's "swap models without touching feature code"
// property. To route a feature to a different model, set its AI_MODEL_* env var.
const env = require("../config/env");

const models = Object.freeze({
  drafted_summary: env.aiModelDraftedSummary || "meta/llama-3.3-70b",
  anomaly_detection: env.aiModelAnomaly || "meta/llama-3.3-70b",
  smart_tagging: env.aiModelTagging || "meta/llama-3.3-70b",
  consistency_flagging: env.aiModelConsistency || "meta/llama-3.3-70b",
  // Bound to text-embedding-3-small (1536 dims). If this ever changes, the O3
  // re-embedding script (scripts/reembed-library.js) backfills the new dims.
  embeddings: env.aiModelEmbeddings || "openai/text-embedding-3-small"
});

// USD per 1M tokens, per model. Ceilings are enforced in-app off these figures;
// per the gateway decision record the audit records the gateway-reported cost
// where available, but we always have a deterministic local estimate. `default`
// is the fallback for any model not listed so a new model never accrues $0.
const prices = Object.freeze({
  "meta/llama-3.3-70b": { input: 0.6, output: 0.6 },
  "openai/text-embedding-3-small": { input: 0.02, output: 0 },
  default: { input: 1.0, output: 1.0 }
});

// The map from feature → embeddings uses the shared embedding model regardless
// of the calling feature (semantic_search today; others may embed later).
function modelFor(feature, kind) {
  if (kind === "embedding") {
    return models.embeddings;
  }
  return models[feature];
}

module.exports = { models, prices, modelFor };
