// P4 · O2 — the runAiCall orchestrator. Gateway fully mocked at the callModel
// seam (jest.spyOn, namespace pattern); repositories mocked. Every one of the
// five ordered steps (entitlement, ceiling, rate limit, gateway+retry, audit)
// is observed here. Covers docs/test-specs.md §P4 "Module unit tests".
const gateway = require("../src/ai/gateway");
const aiRepository = require("../src/repositories/aiRepository");
const entitlementsRepository = require("../src/repositories/entitlementsRepository");
const auditRepository = require("../src/repositories/auditRepository");
const rateLimiter = require("../src/ai/rateLimiter");
const { runAiCall } = require("../src/ai");
const { ROLES } = require("../src/services/constants");

const JULY = new Date("2026-07-15T12:00:00Z");

let logCall;
let getBudget;
let getMonthToDateCost;
let markSoftAlerted;
let isFeatureEnabled;
let appendAuditLog;
let callModel;
let warnSpy;

beforeEach(() => {
  jest.restoreAllMocks();
  rateLimiter.reset();

  logCall = jest.spyOn(aiRepository, "logCall").mockResolvedValue({});
  getBudget = jest.spyOn(aiRepository, "getBudget").mockResolvedValue(null); // → default ceiling
  getMonthToDateCost = jest.spyOn(aiRepository, "getMonthToDateCost").mockResolvedValue(0);
  markSoftAlerted = jest.spyOn(aiRepository, "markSoftAlerted").mockResolvedValue();
  isFeatureEnabled = jest.spyOn(entitlementsRepository, "isFeatureEnabled").mockResolvedValue(true);
  appendAuditLog = jest.spyOn(auditRepository, "appendAuditLog").mockResolvedValue({});
  callModel = jest.spyOn(gateway, "callModel").mockResolvedValue({
    output: "draft text",
    usage: { inputTokens: 1000, outputTokens: 500 },
    reportedProvider: "together",
    reportedModel: "meta/llama-3.3-70b"
  });
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

function draftedSummaryCall(over = {}) {
  return runAiCall({
    feature: "drafted_summary",
    kind: "text",
    facilityId: "fac-A",
    userId: "user-1",
    actingRole: ROLES.AUTHOR,
    traceId: "trace-1",
    prompt: "Summarize the assessment",
    now: JULY,
    ...over
  });
}

describe("runAiCall — success + audit", () => {
  test("returns the output and writes exactly one success ai_call_log row", async () => {
    const result = await draftedSummaryCall();
    expect(result.output).toBe("draft text");
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(logCall).toHaveBeenCalledTimes(1);
  });

  test("the success row carries the full §9.7 field set", async () => {
    await draftedSummaryCall();
    const row = logCall.mock.calls[0][0];
    expect(row).toEqual(
      expect.objectContaining({
        feature: "drafted_summary",
        facilityId: "fac-A",
        userId: "user-1",
        actingRole: ROLES.AUTHOR,
        provider: "together",
        model: "meta/llama-3.3-70b",
        inputTokens: 1000,
        outputTokens: 500,
        outcome: "success",
        traceId: "trace-1"
      })
    );
    expect(typeof row.costUsd).toBe("number");
    expect(row.costUsd).toBeGreaterThan(0);
    expect(typeof row.latencyMs).toBe("number");
    expect(row).toHaveProperty("metadata");
    // created_at is stamped from the same clock used to derive monthKey.
    expect(row.createdAt).toBe(JULY);
  });

  test("provider/model reflect what the gateway REPORTED, not what was requested", async () => {
    callModel.mockResolvedValue({
      output: "x",
      usage: { inputTokens: 1, outputTokens: 1 },
      reportedProvider: "anthropic",
      reportedModel: "anthropic/claude-x"
    });
    await draftedSummaryCall();
    const row = logCall.mock.calls[0][0];
    expect(row.provider).toBe("anthropic");
    expect(row.model).toBe("anthropic/claude-x");
    expect(row.metadata.providerUnverified).toBeUndefined();
  });

  test("falls back to the requested model + providerUnverified when the gateway omits metadata", async () => {
    callModel.mockResolvedValue({ output: "x", usage: { inputTokens: 1, outputTokens: 1 } });
    await draftedSummaryCall();
    const row = logCall.mock.calls[0][0];
    expect(row.model).toBe("meta/llama-3.3-70b");
    expect(row.provider).toBe("meta");
    expect(row.metadata.providerUnverified).toBe(true);
  });
});

describe("runAiCall — cost ceilings", () => {
  test("at 79% the call proceeds with no alert", async () => {
    getBudget.mockResolvedValue({ monthlyUsd: 100, softAlertedForMonth: null });
    getMonthToDateCost.mockResolvedValue(79);
    await draftedSummaryCall();
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(appendAuditLog).not.toHaveBeenCalled();
    expect(markSoftAlerted).not.toHaveBeenCalled();
  });

  test("at 80% a soft alert is emitted ONCE then the call proceeds", async () => {
    getBudget.mockResolvedValue({ monthlyUsd: 100, softAlertedForMonth: null });
    getMonthToDateCost.mockResolvedValue(80);
    await draftedSummaryCall();
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    expect(appendAuditLog.mock.calls[0][0].actionType).toBe("ai-budget-soft-alert");
    expect(markSoftAlerted).toHaveBeenCalledWith({ scope: "facility", scopeId: "fac-A", monthKey: "2026-07", monthlyUsd: 100 });
    expect(warnSpy).toHaveBeenCalled();
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  test("at 80% but already alerted THIS month, no repeat alert", async () => {
    getBudget.mockResolvedValue({ monthlyUsd: 100, softAlertedForMonth: "2026-07" });
    getMonthToDateCost.mockResolvedValue(85);
    await draftedSummaryCall();
    expect(appendAuditLog).not.toHaveBeenCalled();
    expect(markSoftAlerted).not.toHaveBeenCalled();
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  test("at 100% the call is REFUSED with a cost_ceiling_hit row and no gateway call", async () => {
    getBudget.mockResolvedValue({ monthlyUsd: 100, softAlertedForMonth: null });
    getMonthToDateCost.mockResolvedValue(100);
    await expect(draftedSummaryCall()).rejects.toMatchObject({
      status: 429,
      code: "AI_BUDGET_EXHAUSTED",
      details: { scope: "facility" }
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(logCall).toHaveBeenCalledTimes(1);
    expect(logCall.mock.calls[0][0].outcome).toBe("cost_ceiling_hit");
    expect(logCall.mock.calls[0][0].metadata.scope).toBe("facility");
  });

  test("a soft-alert bookkeeping failure never fails the AI call (best-effort)", async () => {
    getBudget.mockResolvedValue({ monthlyUsd: 100, softAlertedForMonth: null });
    getMonthToDateCost.mockResolvedValue(80);
    appendAuditLog.mockRejectedValue(new Error("audit db down"));
    const result = await draftedSummaryCall();
    expect(result.output).toBe("draft text");
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(logCall.mock.calls[0][0].outcome).toBe("success");
  });

  test("ceiling is scoped per facility and per month (rollover resumes)", async () => {
    await draftedSummaryCall({ facilityId: "fac-B" });
    expect(getMonthToDateCost).toHaveBeenCalledWith({ scope: "facility", scopeId: "fac-B", monthKey: "2026-07" });

    getMonthToDateCost.mockClear();
    await draftedSummaryCall({ now: new Date("2026-08-01T00:00:00Z") });
    expect(getMonthToDateCost).toHaveBeenCalledWith(expect.objectContaining({ monthKey: "2026-08" }));
  });

  test("uses the default ceiling when no budget row exists", async () => {
    getBudget.mockResolvedValue(null);
    getMonthToDateCost.mockResolvedValue(49);
    await draftedSummaryCall(); // default facility ceiling is $50 → 49 < 50 proceeds
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});

describe("runAiCall — entitlements", () => {
  test("a disabled add-on feature is refused with 403 and NOTHING runs", async () => {
    isFeatureEnabled.mockResolvedValue(false);
    await expect(draftedSummaryCall({ feature: "anomaly_detection" })).rejects.toMatchObject({
      status: 403,
      code: "FEATURE_NOT_ENABLED"
    });
    expect(callModel).not.toHaveBeenCalled();
    expect(logCall).not.toHaveBeenCalled();
    expect(getBudget).not.toHaveBeenCalled();
  });

  test("an enabled add-on feature proceeds", async () => {
    isFeatureEnabled.mockResolvedValue(true);
    await draftedSummaryCall({ feature: "anomaly_detection" });
    expect(isFeatureEnabled).toHaveBeenCalledWith({ facilityId: "fac-A", featureKey: "anomaly_detection" });
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  test("base features never consult entitlements", async () => {
    await draftedSummaryCall({ feature: "drafted_summary" });
    expect(isFeatureEnabled).not.toHaveBeenCalled();
  });

  test("operator-scoped consistency flagging skips the per-facility entitlement check", async () => {
    await draftedSummaryCall({
      feature: "consistency_flagging",
      facilityId: undefined,
      operatorId: "op-1",
      userId: "system"
    });
    expect(isFeatureEnabled).not.toHaveBeenCalled();
    expect(getMonthToDateCost).toHaveBeenCalledWith({ scope: "operator", scopeId: "op-1", monthKey: "2026-07" });
  });
});

describe("runAiCall — rate limiting", () => {
  test("exceeding the rate limit writes a rate_limited row and 429s before the gateway", async () => {
    jest.spyOn(rateLimiter, "check").mockImplementation(() => {
      throw new Error("rate limited");
    });
    await expect(draftedSummaryCall()).rejects.toMatchObject({ status: 429, code: "AI_RATE_LIMITED" });
    expect(callModel).not.toHaveBeenCalled();
    expect(logCall).toHaveBeenCalledTimes(1);
    expect(logCall.mock.calls[0][0].outcome).toBe("rate_limited");
  });
});

describe("runAiCall — retry + no fallback", () => {
  test("a transient failure triggers exactly one retry with the SAME model, then succeeds", async () => {
    callModel
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        output: "recovered",
        usage: { inputTokens: 2, outputTokens: 2 },
        reportedProvider: "together",
        reportedModel: "meta/llama-3.3-70b"
      });
    const result = await draftedSummaryCall();
    expect(result.output).toBe("recovered");
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0].model).toBe(callModel.mock.calls[1][0].model);
    expect(logCall.mock.calls[0][0].outcome).toBe("success");
  });

  test("two failures → 503 temporarily-unavailable and an error row; NO fallback model tried", async () => {
    callModel.mockRejectedValue(new Error("service down"));
    await expect(draftedSummaryCall()).rejects.toMatchObject({ status: 503, code: "AI_TEMPORARILY_UNAVAILABLE" });
    expect(callModel).toHaveBeenCalledTimes(2);
    // Every attempt used the requested model — no silent provider/model fallback.
    const modelsTried = callModel.mock.calls.map((c) => c[0].model);
    expect(new Set(modelsTried)).toEqual(new Set(["meta/llama-3.3-70b"]));
    expect(logCall.mock.calls[0][0].outcome).toBe("error");
  });

  test("a timeout failure is recorded with the timeout outcome", async () => {
    callModel.mockRejectedValue(new Error("request timeout after 30s"));
    await expect(draftedSummaryCall()).rejects.toMatchObject({ status: 503 });
    expect(logCall.mock.calls[0][0].outcome).toBe("timeout");
  });

  test("the error row never carries the raw error object (message only)", async () => {
    callModel.mockRejectedValue(new Error("boom with secrets"));
    await expect(draftedSummaryCall()).rejects.toBeDefined();
    const row = logCall.mock.calls[0][0];
    expect(typeof row.errorDetail).toBe("string");
    expect(row.errorDetail).toContain("boom with secrets");
  });
});

describe("runAiCall — call kinds", () => {
  test("object kind forwards the schema", async () => {
    callModel.mockResolvedValue({ output: { tags: ["a"] }, usage: { inputTokens: 1, outputTokens: 1 } });
    await draftedSummaryCall({ feature: "smart_tagging", kind: "object", schema: { type: "object" } });
    expect(callModel.mock.calls[0][0]).toMatchObject({ kind: "object", schema: { type: "object" } });
  });

  test("embedding kind uses the embeddings model and forwards the value", async () => {
    callModel.mockResolvedValue({ output: [0.1, 0.2], usage: { inputTokens: 3, outputTokens: 0 } });
    await draftedSummaryCall({ feature: "semantic_search", kind: "embedding", value: "some text" });
    const arg = callModel.mock.calls[0][0];
    expect(arg.kind).toBe("embedding");
    expect(arg.value).toBe("some text");
    expect(arg.model).toBe("openai/text-embedding-3-small");
  });
});
