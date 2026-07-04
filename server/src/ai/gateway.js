// P4 · O2 — the ONLY file in the codebase allowed to import the AI SDK. The
// aiImportBoundary test (tests/aiImportBoundary.test.js) mechanically enforces
// that: any `require('ai')` / `@ai-sdk/*` / provider SDK outside server/src/ai
// fails the build. Everything else calls the module through src/ai/index.js.
//
// The gateway is the single egress (docs/decisions/2026-07-03-ai-gateway-ai-sdk.md).
// The SDK is loaded LAZILY (inside loadSdk, on first real call) rather than at
// module top: the `ai` package is ESM, and eagerly requiring it would break the
// unit suite (which mocks this module at the callModel seam and never makes a
// real call). Production pays the require once, on the first AI call.
//
// callModel normalizes the three call kinds into one shape:
//   { output, usage: { inputTokens, outputTokens }, reportedProvider, reportedModel }
// so runAiCall can audit tokens/cost and record what the gateway ACTUALLY
// routed to (falling back to the requested string when the metadata is absent).
const env = require("../config/env");

let sdk = null;
function loadSdk() {
  if (!sdk) {
    const { generateText, generateObject, embed } = require("ai");
    const { createGateway } = require("@ai-sdk/gateway");
    sdk = {
      generateText,
      generateObject,
      embed,
      provider: createGateway({ apiKey: env.aiGatewayApiKey })
    };
  }
  return sdk;
}

// AI SDK usage shapes differ per call kind; normalize to input/output tokens.
function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? usage.tokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0
  };
}

// What the gateway REPORTS it routed to. `response.modelId` is the concrete
// model; the gateway's providerMetadata carries the resolved provider. Either
// may be absent on some paths — runAiCall then falls back to the requested
// string and flags metadata.providerUnverified.
function reported(response, providerMetadata) {
  const gatewayMeta = (providerMetadata && providerMetadata.gateway) || {};
  return {
    reportedProvider: gatewayMeta.provider,
    reportedModel: response && response.modelId
  };
}

// F2 resolution 2026-07-04 (retry taxonomy): classify a gateway/SDK failure as
// PERMANENT (retrying cannot help — auth, malformed request, unknown model,
// payload too large, schema validation) vs TRANSIENT (5xx, provider 429,
// timeout, network). Duck-typed on statusCode/name so no SDK import is needed
// at module top (the lazy-load constraint above). Unknown errors default to
// transient — one retry on an unknown failure is the safe posture. This lives
// HERE because only this file is allowed to know SDK error shapes; runAiCall
// reads only the aiPermanent tag.
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 413, 422]);

function isPermanentError(err) {
  if (!err || typeof err !== "object") {
    return false;
  }
  const status = err.statusCode ?? err.status;
  if (typeof status === "number") {
    return PERMANENT_STATUS_CODES.has(status);
  }
  const name = String(err.name || "");
  return (
    name.includes("NoObjectGenerated") ||
    name.includes("TypeValidation") ||
    name.includes("InvalidPrompt") ||
    name.includes("InvalidArgument")
  );
}

async function callModel(args) {
  try {
    return await dispatch(args);
  } catch (err) {
    if (err && typeof err === "object") {
      err.aiPermanent = isPermanentError(err);
    }
    throw err;
  }
}

async function dispatch({ kind, model, prompt, schema, value }) {
  const { generateText, generateObject, embed, provider } = loadSdk();

  if (kind === "embedding") {
    const { embedding, usage, response, providerMetadata } = await embed({
      model: provider.textEmbeddingModel(model),
      value
    });
    return { output: embedding, usage: normalizeUsage(usage), ...reported(response, providerMetadata) };
  }

  if (kind === "object") {
    const { object, usage, response, providerMetadata } = await generateObject({
      model: provider.languageModel(model),
      schema,
      prompt
    });
    return { output: object, usage: normalizeUsage(usage), ...reported(response, providerMetadata) };
  }

  const { text, usage, response, providerMetadata } = await generateText({
    model: provider.languageModel(model),
    prompt
  });
  return { output: text, usage: normalizeUsage(usage), ...reported(response, providerMetadata) };
}

module.exports = { callModel, isPermanentError };
