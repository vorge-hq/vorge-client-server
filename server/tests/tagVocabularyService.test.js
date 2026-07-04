// P4 · O4 — pure controlled-vocabulary logic. The out-of-vocabulary DISCARD rule
// (§9.6) is exercised here in isolation; the integration suite proves it end to
// end through a mocked model.
const { validateTags, defaultVocabularyRows, DEFAULT_VOCABULARY } = require("../src/services/tagVocabularyService");

const VOCAB = [
  { category: "threat_type", value: "Insider" },
  { category: "threat_type", value: "Terrorism" },
  { category: "asset_class", value: "Control Room" },
  { category: "consequence_category", value: "People" }
];

describe("validateTags", () => {
  test("keeps only in-vocabulary tags, discarding the rest", () => {
    const kept = validateTags({ vocabulary: VOCAB, tags: ["Insider", "Sabotage", "Control Room", "Aliens"] });
    expect(kept).toEqual([
      { category: "threat_type", value: "Insider" },
      { category: "asset_class", value: "Control Room" }
    ]);
  });

  test("maps a matched string back to its canonical category + value", () => {
    const kept = validateTags({ vocabulary: VOCAB, tags: ["people"] });
    expect(kept).toEqual([{ category: "consequence_category", value: "People" }]);
  });

  test("is case- and whitespace-insensitive but returns the canonical value", () => {
    const kept = validateTags({ vocabulary: VOCAB, tags: ["  insider ", "TERRORISM"] });
    expect(kept).toEqual([
      { category: "threat_type", value: "Insider" },
      { category: "threat_type", value: "Terrorism" }
    ]);
  });

  test("collapses duplicates and preserves suggestion order", () => {
    const kept = validateTags({ vocabulary: VOCAB, tags: ["Terrorism", "Insider", "Terrorism"] });
    expect(kept.map((t) => t.value)).toEqual(["Terrorism", "Insider"]);
  });

  test("empty / non-array / all-invalid input yields []", () => {
    expect(validateTags({ vocabulary: VOCAB, tags: [] })).toEqual([]);
    expect(validateTags({ vocabulary: VOCAB, tags: null })).toEqual([]);
    expect(validateTags({ vocabulary: VOCAB, tags: ["nope", "", "  "] })).toEqual([]);
    expect(validateTags({ vocabulary: [], tags: ["Insider"] })).toEqual([]);
  });
});

describe("defaultVocabularyRows", () => {
  test("flattens the starter vocabulary into {category,value} rows", () => {
    const rows = defaultVocabularyRows();
    const threatCount = DEFAULT_VOCABULARY.threat_type.length;
    expect(rows.filter((r) => r.category === "threat_type")).toHaveLength(threatCount);
    expect(rows).toContainEqual({ category: "threat_type", value: "Insider" });
    expect(rows).toContainEqual({ category: "consequence_category", value: "People" });
    // region ships empty — no rows.
    expect(rows.some((r) => r.category === "region")).toBe(false);
  });
});
