// P4 · F2 gate — the retry-taxonomy classifier lives at the gateway seam (the
// only file allowed to know SDK error shapes). Duck-typed; unknown → transient.
// Safe to require: gateway.js lazy-loads the ESM SDK only on a real call.
const { isPermanentError } = require("../src/ai/gateway");

describe("gateway.isPermanentError", () => {
  test.each([[400], [401], [403], [404], [413], [422]])("statusCode %i → permanent", (statusCode) => {
    expect(isPermanentError({ statusCode })).toBe(true);
  });

  test.each([[408], [429], [500], [502], [503], [529]])("statusCode %i → transient", (statusCode) => {
    expect(isPermanentError({ statusCode })).toBe(false);
  });

  test("honors err.status as well as err.statusCode", () => {
    expect(isPermanentError({ status: 401 })).toBe(true);
    expect(isPermanentError({ status: 503 })).toBe(false);
  });

  test.each([
    ["AI_NoObjectGeneratedError"],
    ["AI_TypeValidationError"],
    ["AI_InvalidPromptError"],
    ["InvalidArgumentError"]
  ])("SDK validation error name %s → permanent", (name) => {
    expect(isPermanentError({ name, message: "x" })).toBe(true);
  });

  test("network-ish errors with no statusCode → transient", () => {
    expect(isPermanentError({ code: "ECONNRESET", message: "socket hang up" })).toBe(false);
    expect(isPermanentError(new Error("fetch failed"))).toBe(false);
  });

  test("null/undefined/non-object → transient (never throws)", () => {
    expect(isPermanentError(null)).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
    expect(isPermanentError("boom")).toBe(false);
  });
});
