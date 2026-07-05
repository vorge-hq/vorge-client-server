// P4 · O5 — the drafted-summary prompt builder. The risk distribution + top
// scenarios must be DERIVED from the stored { consequence, likelihood } shape
// (score/band are never persisted), not read from a non-existent r1.band/score.
const { buildDraftPrompt, riskDistribution } = require("../src/ai/prompts/draftedSummary");

const ASSESSMENT = { name: "Bonny 2026 SRA", facilityName: "Bonny Terminal", facilityId: "f1" };

// c×l: 5×4=20 → Very High, 3×3=9 → Medium, 2×2=4 → Low, 1×1=1 → Low.
const EVALUATIONS = [
  { id: "e1", assetId: "a1", threatId: "t1", scenario: "Vendor remote access compromise", r1: { consequence: 5, likelihood: 4 } },
  { id: "e2", assetId: "a2", threatId: "t2", scenario: "Perimeter breach at the jetty", r1: { consequence: 3, likelihood: 3 } },
  { id: "e3", assetId: "a1", threatId: "t2", scenario: "Minor tailgating incident", r1: { consequence: 2, likelihood: 2 } }
];
const ASSETS = [
  { id: "a1", name: "Central Control Room" },
  { id: "a2", name: "Marine Terminal" }
];
const THREATS = [
  { id: "t1", name: "Cyber" },
  { id: "t2", name: "Intrusion" }
];

describe("riskDistribution", () => {
  test("derives bands from consequence × likelihood (not a stored band)", () => {
    expect(riskDistribution(EVALUATIONS)).toBe("Very High: 1, High: 0, Medium: 1, Low: 1");
  });

  test("out-of-range / missing risk data does not count and never throws", () => {
    expect(riskDistribution([{ r1: {} }, { r1: { consequence: 0, likelihood: 3 } }, {}])).toBe(
      "Very High: 0, High: 0, Medium: 0, Low: 0"
    );
  });
});

describe("buildDraftPrompt", () => {
  const bundle = {
    assessment: ASSESSMENT,
    assets: ASSETS,
    threats: THREATS,
    evaluations: EVALUATIONS,
    mitigations: [{ id: "m1" }],
    sectionTexts: {}
  };

  test("section 1 is an Executive Summary with a real (non-zero) risk distribution", () => {
    const prompt = buildDraftPrompt({ sectionNumber: 1, ...bundle });
    expect(prompt).toContain("Executive Summary");
    expect(prompt).toContain("Very High: 1, High: 0, Medium: 1, Low: 1");
    expect(prompt).toContain("Bonny Terminal");
  });

  test("scenarios are ordered by derived score, highest first, with the band label", () => {
    const prompt = buildDraftPrompt({ sectionNumber: 1, ...bundle });
    const idxTop = prompt.indexOf("Vendor remote access compromise");
    const idxMid = prompt.indexOf("Perimeter breach at the jetty");
    expect(idxTop).toBeGreaterThan(-1);
    expect(idxTop).toBeLessThan(idxMid);
    expect(prompt).toContain("[Very High]");
  });

  test("section 8 is a Conclusion", () => {
    const prompt = buildDraftPrompt({ sectionNumber: 8, ...bundle });
    expect(prompt).toContain("Conclusion");
  });
});
