// P4 · O2 — pure ceiling/cost math. Under the 95% services coverage gate, so
// every branch (boundary 79/80/100, month rollover latch, price fallbacks) is
// exercised directly here rather than through the orchestrator.
const {
  DEFAULT_MONTHLY_USD,
  SOFT_ALERT_FRACTION,
  monthKey,
  defaultMonthlyUsd,
  computeCost,
  evaluateCeiling
} = require("../src/services/aiBudgetService");

describe("aiBudgetService.monthKey", () => {
  test("formats YYYY-MM in UTC", () => {
    expect(monthKey(new Date("2026-07-04T23:30:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(monthKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  test("rolls to the next month at the UTC boundary", () => {
    expect(monthKey(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-08-01T00:00:00Z"))).toBe("2026-08");
  });

  test("defaults to now when called with no argument", () => {
    expect(monthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("aiBudgetService.defaultMonthlyUsd", () => {
  test("facility → $50, operator → $20", () => {
    expect(defaultMonthlyUsd("facility")).toBe(50);
    expect(defaultMonthlyUsd("operator")).toBe(20);
    expect(DEFAULT_MONTHLY_USD).toEqual({ facility: 50, operator: 20 });
  });

  test("unknown scope falls back to the facility default", () => {
    expect(defaultMonthlyUsd("bogus")).toBe(50);
  });
});

describe("aiBudgetService.computeCost", () => {
  const prices = { "meta/llama-3.3-70b": { input: 0.6, output: 0.6 }, default: { input: 1, output: 1 } };

  test("prices known models per 1M tokens, rounded to 6dp", () => {
    // (1_000_000/1e6)*0.6 + (500_000/1e6)*0.6 = 0.6 + 0.3 = 0.9
    expect(computeCost({ model: "meta/llama-3.3-70b", inputTokens: 1_000_000, outputTokens: 500_000, prices })).toBe(0.9);
  });

  test("unknown model with no fallback falls back to prices.default", () => {
    expect(computeCost({ model: "who/knows", inputTokens: 1_000_000, outputTokens: 0, prices })).toBe(1);
  });

  test("a reported variant id falls back to the requested model's price, not the generic default", () => {
    // Gateway reports a versioned id not in the table; fallbackModel is the priced alias.
    expect(
      computeCost({
        model: "meta/llama-3.3-70b-0125",
        fallbackModel: "meta/llama-3.3-70b",
        inputTokens: 1_000_000,
        outputTokens: 0,
        prices
      })
    ).toBe(0.6);
  });

  test("when both the reported and fallback models are unpriced, uses the default", () => {
    expect(
      computeCost({ model: "a/b", fallbackModel: "c/d", inputTokens: 1_000_000, outputTokens: 0, prices })
    ).toBe(1);
  });

  test("no price table at all → zero cost", () => {
    expect(computeCost({ model: "x", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(0);
  });

  test("price table without the model and without a default → zero", () => {
    expect(computeCost({ model: "x", inputTokens: 1_000_000, outputTokens: 0, prices: {} })).toBe(0);
  });

  test("defaults token counts to zero", () => {
    expect(computeCost({ model: "meta/llama-3.3-70b", prices })).toBe(0);
  });
});

describe("aiBudgetService.evaluateCeiling", () => {
  const base = { monthlyUsd: 100, softAlertedForMonth: null, currentMonthKey: "2026-07" };

  test("79% → proceed, no alert", () => {
    const v = evaluateCeiling({ ...base, spentUsd: 79 });
    expect(v.exhausted).toBe(false);
    expect(v.shouldAlert).toBe(false);
  });

  test("80% → soft alert (not yet alerted this month)", () => {
    const v = evaluateCeiling({ ...base, spentUsd: 80 });
    expect(v.exhausted).toBe(false);
    expect(v.shouldAlert).toBe(true);
  });

  test("80% but already alerted THIS month → no repeat alert", () => {
    const v = evaluateCeiling({ ...base, spentUsd: 85, softAlertedForMonth: "2026-07" });
    expect(v.shouldAlert).toBe(false);
    expect(v.exhausted).toBe(false);
  });

  test("80% and alerted in a PRIOR month → alert again (rollover)", () => {
    const v = evaluateCeiling({ ...base, spentUsd: 85, softAlertedForMonth: "2026-06" });
    expect(v.shouldAlert).toBe(true);
  });

  test("100% → exhausted, no alert", () => {
    const v = evaluateCeiling({ ...base, spentUsd: 100 });
    expect(v.exhausted).toBe(true);
    expect(v.shouldAlert).toBe(false);
  });

  test("over budget → exhausted", () => {
    expect(evaluateCeiling({ ...base, spentUsd: 150 }).exhausted).toBe(true);
  });

  test("non-positive budget is always exhausted (never divide by zero)", () => {
    const v = evaluateCeiling({ ...base, monthlyUsd: 0, spentUsd: 0 });
    expect(v.exhausted).toBe(true);
    expect(v.pct).toBe(Infinity);
  });

  test("SOFT_ALERT_FRACTION is 0.8", () => {
    expect(SOFT_ALERT_FRACTION).toBe(0.8);
  });
});
