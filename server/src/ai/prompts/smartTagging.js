// P4 · O4 — the smart-tagging prompt (§9.6). Version-controlled here, one file
// per feature, per the AI-module layout. The route reads the evaluation's
// scenario + the facility vocabulary, calls runAiCall({kind:'object'}) with the
// schema below, and the returned strings are validated against the vocabulary by
// tagVocabularyService (out-of-vocab discarded). This file holds NO SDK import —
// only zod (a normal dependency) — so the aiImportBoundary scan is unaffected.
const { z } = require("zod");

// Structured-output contract: a flat list of vocabulary strings. min 0 so a
// model that finds no confident tag returns {tags:[]} rather than being forced
// to invent one; the 2–4 guidance lives in the prompt, and over/under-supply is
// harmless because validation is the real gate.
const TAG_OUTPUT_SCHEMA = z.object({
  tags: z.array(z.string()).max(8)
});

function buildTaggingPrompt({ scenario, vocabulary = [] }) {
  const values = vocabulary.map((v) => v.value);
  return [
    "You classify physical-security risk scenarios with tags drawn from a fixed controlled vocabulary.",
    "",
    "Risk scenario:",
    `"""${scenario || ""}"""`,
    "",
    "Controlled vocabulary — you may ONLY return values from this exact list:",
    values.map((v) => `- ${v}`).join("\n"),
    "",
    "Return the 2 to 4 tags that best classify the scenario. Copy the values EXACTLY as written",
    "above (same spelling and capitalization). Do not invent tags or return anything outside the list.",
    "If nothing fits, return an empty list."
  ].join("\n");
}

module.exports = { TAG_OUTPUT_SCHEMA, buildTaggingPrompt };
