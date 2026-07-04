// P4 · O4 — PURE controlled-vocabulary logic for smart tagging (§9.6). No DB, no
// AI, no I/O — all branching lives here so the 95% service-coverage gate applies
// and the "out-of-vocabulary tags are DISCARDED, never persisted" rule is
// exercised in isolation.
//
// The model returns a flat list of tag STRINGS ({ tags: string[] }); this module
// resolves each string against the facility's vocabulary, keeping only exact
// (case/whitespace-insensitive) matches and mapping them back to the CANONICAL
// {category, value} pair. Anything not in the dictionary is dropped.

// Starter vocabulary seeded per facility (businesslogic §19.1 threat
// classifications + §6.3 asset types + §19.5 consequence axes). `region` ships
// empty — it is facility-specific and Admin-curated post-v1.
const DEFAULT_VOCABULARY = Object.freeze({
  threat_type: Object.freeze([
    "Organized Crime",
    "Criminality",
    "Civil / Community Unrest",
    "Armed Conflicts",
    "Terrorism",
    "Cybercrime & Data Breaches",
    "Insider",
    "Maritime"
  ]),
  asset_class: Object.freeze([
    "Process Unit",
    "Storage Tank Farm",
    "Control Room",
    "Marine Loading Terminal",
    "Administration Building",
    "Utility Substation",
    "Fuel Loading Skid"
  ]),
  consequence_category: Object.freeze(["People", "Assets", "Environment", "Reputation"]),
  region: Object.freeze([])
});

// Flatten DEFAULT_VOCABULARY into insertable { category, value } rows.
function defaultVocabularyRows() {
  const rows = [];
  for (const [category, values] of Object.entries(DEFAULT_VOCABULARY)) {
    for (const value of values) {
      rows.push({ category, value });
    }
  }
  return rows;
}

function normalize(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase();
}

// Given the facility's vocabulary ([{category, value}]) and the model's raw tag
// strings, return the canonical {category, value} pairs that are IN the
// vocabulary — out-of-vocab discarded, duplicates collapsed, order preserved
// from the model's suggestion. A non-array / empty input yields [].
function validateTags({ vocabulary = [], tags = [] }) {
  const byNorm = new Map();
  for (const entry of vocabulary) {
    if (entry && entry.value != null) {
      // First category wins if the same string somehow appears twice.
      const key = normalize(entry.value);
      if (!byNorm.has(key)) {
        byNorm.set(key, { category: entry.category, value: entry.value });
      }
    }
  }

  const seen = new Set();
  const kept = [];
  for (const raw of Array.isArray(tags) ? tags : []) {
    const key = normalize(raw);
    if (!key || seen.has(key)) {
      continue;
    }
    const match = byNorm.get(key);
    if (match) {
      seen.add(key);
      kept.push({ category: match.category, value: match.value });
    }
  }
  return kept;
}

module.exports = { DEFAULT_VOCABULARY, defaultVocabularyRows, validateTags, normalize };
