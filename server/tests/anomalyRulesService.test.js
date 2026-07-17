// P4 · O6 — the deterministic half of the anomaly engine (§9.2). Pure service,
// no DB, no gateway. Per docs/test-specs.md §P4 ("anomaly engine (each
// deterministic rule: one positive + one negative case)") every rule below has
// BOTH, and the negatives encode the binding tuning posture: "better to
// under-flag than over-flag" — incomplete data must never produce a flag.
const { RULE_KEYS, runDeterministicRules } = require("../src/services/anomalyRulesService");

function asset(overrides = {}) {
  return {
    id: "asset-1",
    name: "Pump House",
    criticality: "High",
    details: {},
    ...overrides
  };
}

function evaluation(overrides = {}) {
  return {
    id: "eval-1",
    assetId: "asset-1",
    r1: {},
    ...overrides
  };
}

const keysOf = (flags) => flags.map((f) => f.ruleKey);

describe("anomalyRulesService — asset-criticality-consequences (§9.2)", () => {
  test("POSITIVE: Low criticality with a fatality consequence is flagged on the asset", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Low", details: { consequences: "Possible fatality on the jetty" } })]
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
      entityType: "asset",
      entityId: "asset-1"
    });
    expect(flags[0].message).toContain("fatal");
  });

  test("POSITIVE: Medium criticality with a major environmental release is flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Medium", details: { consequences: "Major environmental release to the river" } })]
    });

    expect(keysOf(flags)).toEqual([RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES]);
  });

  test("NEGATIVE: the same severe consequence on a Very High criticality asset is NOT flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Very High", details: { consequences: "Possible fatality on the jetty" } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE: Low criticality with a mild consequence is NOT flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Low", details: { consequences: "Minor delay to loading operations" } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE (under-flag on incomplete data): no criticality, or no consequences text, yields nothing", () => {
    expect(
      runDeterministicRules({ assets: [asset({ criticality: null, details: { consequences: "fatality" } })] })
    ).toEqual([]);
    expect(runDeterministicRules({ assets: [asset({ criticality: "Low", details: {} })] })).toEqual([]);
  });
});

describe("anomalyRulesService — severity-vs-criticality (§9.2)", () => {
  test("POSITIVE: a Massive (5) R1 consequence on a Low-criticality asset is flagged on the evaluation", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Low" })],
      evaluations: [evaluation({ r1: { consequence: 5, likelihood: 2 } })]
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      ruleKey: RULE_KEYS.SEVERITY_VS_CRITICALITY,
      entityType: "evaluation",
      entityId: "eval-1"
    });
    expect(flags[0].message).toContain("Pump House");
  });

  test("NEGATIVE: a Massive (5) consequence on a High-criticality asset is NOT flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "High" })],
      evaluations: [evaluation({ r1: { consequence: 5, likelihood: 2 } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE (deliberate under-flag): consequence 4 on a Low-criticality asset is NOT flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset({ criticality: "Low" })],
      evaluations: [evaluation({ r1: { consequence: 4, likelihood: 2 } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE: an evaluation whose asset is missing from the bundle yields nothing", () => {
    const flags = runDeterministicRules({
      assets: [],
      evaluations: [evaluation({ r1: { consequence: 5, likelihood: 2 } })]
    });

    expect(flags).toEqual([]);
  });
});

describe("anomalyRulesService — r1-math-consistency (§9.2)", () => {
  test("POSITIVE: a stored R1 score that is not consequence x likelihood is flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset()],
      evaluations: [evaluation({ r1: { consequence: 3, likelihood: 2, score: 12 } })]
    });

    expect(keysOf(flags)).toEqual([RULE_KEYS.R1_MATH_CONSISTENCY]);
    expect(flags[0].message).toContain("6");
  });

  test("POSITIVE: an axis value outside the 1-5 matrix is flagged", () => {
    expect(
      keysOf(runDeterministicRules({ assets: [asset()], evaluations: [evaluation({ r1: { consequence: 7, likelihood: 2 } })] }))
    ).toEqual([RULE_KEYS.R1_MATH_CONSISTENCY]);
    expect(
      keysOf(runDeterministicRules({ assets: [asset()], evaluations: [evaluation({ r1: { consequence: 3, likelihood: 9 } })] }))
    ).toEqual([RULE_KEYS.R1_MATH_CONSISTENCY]);
  });

  test("NEGATIVE: a score that matches consequence x likelihood is NOT flagged", () => {
    const flags = runDeterministicRules({
      assets: [asset()],
      evaluations: [evaluation({ r1: { consequence: 3, likelihood: 2, score: 6 } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE (under-flag): axis values with no stored score are NOT flagged — the client derives the score", () => {
    const flags = runDeterministicRules({
      assets: [asset()],
      evaluations: [evaluation({ r1: { consequence: 4, likelihood: 4 } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE: consequence 0 is the matrix's explicit 'no consequence' — score is N/A, nothing is checked", () => {
    const flags = runDeterministicRules({
      assets: [asset()],
      evaluations: [evaluation({ r1: { consequence: 0, likelihood: 3, score: 99 } })]
    });

    expect(flags).toEqual([]);
  });

  test("NEGATIVE: an unrated evaluation yields nothing", () => {
    expect(runDeterministicRules({ assets: [asset()], evaluations: [evaluation({ r1: {} })] })).toEqual([]);
    expect(runDeterministicRules({ assets: [asset()], evaluations: [evaluation({ r1: null })] })).toEqual([]);
  });
});

describe("anomalyRulesService — engine", () => {
  test("returns a stable order: asset flags first, then evaluations in bundle order", () => {
    const flags = runDeterministicRules({
      assets: [
        asset({ id: "asset-1", criticality: "Low", details: { consequences: "fatality risk" } }),
        asset({ id: "asset-2", name: "Tank", criticality: "Low", details: {} })
      ],
      evaluations: [
        evaluation({ id: "eval-1", assetId: "asset-2", r1: { consequence: 5, likelihood: 1 } }),
        evaluation({ id: "eval-2", assetId: "asset-1", r1: { consequence: 2, likelihood: 2, score: 9 } })
      ]
    });

    expect(flags.map((f) => [f.entityType, f.entityId, f.ruleKey])).toEqual([
      ["asset", "asset-1", RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES],
      ["evaluation", "eval-1", RULE_KEYS.SEVERITY_VS_CRITICALITY],
      ["evaluation", "eval-2", RULE_KEYS.R1_MATH_CONSISTENCY]
    ]);
  });

  test("a clean assessment produces no flags (the steady state)", () => {
    expect(
      runDeterministicRules({
        assets: [asset({ criticality: "High", details: { consequences: "Loading delay" } })],
        evaluations: [evaluation({ r1: { consequence: 3, likelihood: 3, score: 9 } })]
      })
    ).toEqual([]);
  });

  test("called with nothing at all, returns no flags rather than throwing", () => {
    expect(runDeterministicRules()).toEqual([]);
    expect(runDeterministicRules({})).toEqual([]);
  });
});
