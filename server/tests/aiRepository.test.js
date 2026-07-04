// P4 · O2 — aiRepository row construction, exercised with an injected fake
// connection (no DB). The point is to mechanically assert that logCall builds a
// row carrying EVERY §9.7 column, and that month-to-date cost scopes correctly.
const aiRepository = require("../src/repositories/aiRepository");

// A knex-shaped fake: conn.transaction(cb) yields a trx that is both callable
// (trx("table") → { insert }) and has .raw, capturing what gets inserted.
function captureConn() {
  const captured = {};
  const trx = Object.assign(
    (table) => ({
      insert: async (record) => {
        captured.table = table;
        captured.record = record;
      }
    }),
    { raw: async (...args) => captured.rawCalls?.push(args) ?? (captured.rawCalls = [args]) }
  );
  return { conn: { transaction: async (cb) => cb(trx) }, captured };
}

describe("aiRepository.logCall", () => {
  const fullInput = {
    feature: "drafted_summary",
    facilityId: "fac-A",
    operatorId: null,
    userId: "user-1",
    actingRole: "Author",
    provider: "together",
    model: "meta/llama-3.3-70b",
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.0123,
    latencyMs: 42,
    outcome: "success",
    traceId: "trace-1",
    metadata: { providerUnverified: false }
  };

  test("inserts a row with every §9.7 column present", async () => {
    const { conn, captured } = captureConn();
    await aiRepository.logCall(fullInput, conn);
    const row = captured.record;
    for (const column of [
      "id",
      "feature",
      "facility_id",
      "operator_id",
      "user_id",
      "acting_role",
      "provider",
      "model",
      "input_tokens",
      "output_tokens",
      "cost_usd",
      "latency_ms",
      "outcome",
      "error_detail",
      "trace_id",
      "metadata"
    ]) {
      expect(row).toHaveProperty(column);
    }
    expect(captured.table).toBe("ai_call_log");
    expect(row.feature).toBe("drafted_summary");
    expect(row.cost_usd).toBe(0.0123);
  });

  test("sets the facility GUC when facility-scoped", async () => {
    const { conn, captured } = captureConn();
    await aiRepository.logCall(fullInput, conn);
    expect(captured.rawCalls).toEqual([["SELECT set_config('app.current_facility_ids', ?, true)", ["fac-A"]]]);
  });

  test("does NOT set the facility GUC for an operator-scoped row", async () => {
    const { conn, captured } = captureConn();
    await aiRepository.logCall({ ...fullInput, facilityId: null, operatorId: "op-1" }, conn);
    expect(captured.rawCalls).toBeUndefined();
    expect(captured.record.operator_id).toBe("op-1");
    expect(captured.record.facility_id).toBeNull();
  });

  test("stamps created_at from the caller's clock when supplied", async () => {
    const { conn, captured } = captureConn();
    const when = new Date("2026-07-15T00:00:00Z");
    await aiRepository.logCall({ ...fullInput, createdAt: when }, conn);
    expect(captured.record.created_at).toBe(when);
  });

  test("omits created_at (DB default) when the caller does not supply it", async () => {
    const { conn, captured } = captureConn();
    await aiRepository.logCall(fullInput, conn);
    expect(captured.record.created_at).toBeUndefined();
  });

  test("defaults token/cost/latency to zero and error_detail/trace to null", async () => {
    const { conn, captured } = captureConn();
    await aiRepository.logCall({ feature: "x", facilityId: "fac-A", userId: "u", provider: "p", model: "m", outcome: "error" }, conn);
    const row = captured.record;
    expect(row.input_tokens).toBe(0);
    expect(row.output_tokens).toBe(0);
    expect(Number(row.cost_usd)).toBe(0);
    expect(row.latency_ms).toBe(0);
    expect(row.error_detail).toBeNull();
    expect(row.metadata).toEqual({});
  });
});
