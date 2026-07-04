// P4 · O3 — unit coverage for the semantic-search pure helpers (no DB, no
// network). The end-to-end pipeline + search are proven in
// tests/integration/librarySearch.test.js.
const { toVectorLiteral, EMBEDDING_DIMS } = require("../src/repositories/libraryRepository");
const { embeddingText } = require("../src/ai/libraryEmbedding");

describe("toVectorLiteral", () => {
  test("formats a full-dim vector as a pgvector literal", () => {
    const v = new Array(EMBEDDING_DIMS).fill(0);
    v[0] = 0.5;
    v[EMBEDDING_DIMS - 1] = -0.25;
    const literal = toVectorLiteral(v);
    expect(literal.startsWith("[0.5,")).toBe(true);
    expect(literal.endsWith(",-0.25]")).toBe(true);
  });

  test("rejects a wrong-dimension vector (never sends a bad cast to the DB)", () => {
    expect(() => toVectorLiteral([1, 2, 3])).toThrow(/1536-dim/);
    try {
      toVectorLiteral([1, 2, 3]);
    } catch (err) {
      expect(err.code).toBe("EMBEDDING_SHAPE_INVALID");
      expect(err.status).toBe(500);
    }
  });

  test("rejects a non-array", () => {
    expect(() => toVectorLiteral(null)).toThrow(/EMBEDDING|1536/i);
    expect(() => toVectorLiteral("[1,2,3]")).toThrow();
  });

  test("rejects a full-dim vector with a non-finite / non-number element", () => {
    const withNaN = new Array(EMBEDDING_DIMS).fill(0);
    withNaN[5] = NaN;
    expect(() => toVectorLiteral(withNaN)).toThrow(/non-finite/);

    const withInfinity = new Array(EMBEDDING_DIMS).fill(0);
    withInfinity[5] = Infinity;
    expect(() => toVectorLiteral(withInfinity)).toThrow(/non-finite/);

    const withString = new Array(EMBEDDING_DIMS).fill(0);
    withString[5] = "0.1";
    expect(() => toVectorLiteral(withString)).toThrow(/non-finite/);
  });
});

describe("embeddingText", () => {
  test("joins title and body", () => {
    expect(embeddingText({ title: "Night theft", body: "Theft from the yard" })).toBe("Night theft\n\nTheft from the yard");
  });

  test("drops an empty part cleanly", () => {
    expect(embeddingText({ title: "Only title", body: "" })).toBe("Only title");
    expect(embeddingText({ title: "", body: "Only body" })).toBe("Only body");
  });
});
