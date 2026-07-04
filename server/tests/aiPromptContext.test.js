// P4 · O2 — scoping-by-construction. The builder THROWS (not filters) when a
// prompt would include an entity outside the request's facility/operator scope.
const { buildPromptContext, buildOperatorPromptContext } = require("../src/ai/promptContext");

describe("buildPromptContext", () => {
  test("throws CROSS_FACILITY_PROMPT on any out-of-scope entity", () => {
    let caught;
    try {
      buildPromptContext({ facilityId: "fac-A", entities: [{ facilityId: "fac-A" }, { facility_id: "fac-B" }] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe("CROSS_FACILITY_PROMPT");
    expect(caught.status).toBe(500);
    expect(caught.details).toMatchObject({ expectedFacilityId: "fac-A", entityFacilityId: "fac-B" });
  });

  test("passes when every entity is in scope (camel and snake shapes)", () => {
    const ctx = buildPromptContext({ facilityId: "fac-A", entities: [{ facilityId: "fac-A" }, { facility_id: "fac-A" }] });
    expect(ctx.entities).toHaveLength(2);
    expect(ctx.facilityId).toBe("fac-A");
  });

  test("entities with no facility id do not trip the guard", () => {
    expect(() => buildPromptContext({ facilityId: "fac-A", entities: [{}, { name: "x" }] })).not.toThrow();
  });

  test("requires a facility scope", () => {
    expect(() => buildPromptContext({ entities: [] })).toThrow(/facility scope is required/i);
  });
});

describe("buildOperatorPromptContext", () => {
  test("throws CROSS_OPERATOR_PROMPT on cross-operator data", () => {
    let caught;
    try {
      buildOperatorPromptContext({ operatorId: "op-1", facilities: [{ operatorId: "op-1" }, { operator_id: "op-2" }] });
    } catch (err) {
      caught = err;
    }
    expect(caught.code).toBe("CROSS_OPERATOR_PROMPT");
    expect(caught.status).toBe(500);
  });

  test("allows facilities within the same operator", () => {
    const ctx = buildOperatorPromptContext({ operatorId: "op-1", facilities: [{ operator_id: "op-1" }] });
    expect(ctx.facilities).toHaveLength(1);
  });

  test("requires an operator scope", () => {
    expect(() => buildOperatorPromptContext({ facilities: [] })).toThrow(/operator scope is required/i);
  });
});
