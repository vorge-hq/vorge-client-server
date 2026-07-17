// P4 · O6 — anomaly detection integration suite (supertest + REAL Postgres).
// Gateway mocked at the callModel seam (kind 'object'), so no network. Proves
// the §P4 anomaly DoD end-to-end:
//   - the ADD-ON gate: entitlement disabled → 403 FEATURE_NOT_ENABLED with ZERO
//     gateway calls AND no deterministic flags either (the whole feature is the
//     add-on, free rules included); enabling flips the same request to 200;
//     facility B unaffected.
//   - acknowledgement suppresses per-Author ONLY: a second Author on the SAME
//     assessment still sees the flag (§9.2).
//   - advisory only: an AI failure degrades to the deterministic flags instead
//     of erroring the Author's request.
//   - Author+Draft gating, the Mitigation Owner × AI endpoint 403, cross-tenant
//     404, 401, Zod 400, and the audit rows (anomaly-flagged / anomaly-acknowledged).
// The per-rule positive/negative matrix is the pure unit suite
// (tests/anomalyRulesService.test.js); this file proves the wiring.
//
// AI must be ON; set before app require and restored in afterAll so sibling
// suites (AI off) are unaffected.
const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
process.env.AI_ENABLED = "true";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const gateway = require("../../src/ai/gateway");
const { ROLES } = require("../../src/services/constants");
const { RULE_KEYS } = require("../../src/services/anomalyRulesService");
const { FACILITIES, ASSESSMENTS, CHILD, USERS, OPERATORS, truncateAll, seedFixtures, id } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = FACILITIES.A2.id; // Draft assessment, Author = authorA2
const A2_ASSESSMENT = ASSESSMENTS.A2.id;
const A2_ASSET = CHILD.A2.asset;
const A2_EVAL = CHILD.A2.evaluation;
const A1 = FACILITIES.A1.id;
const A1_ASSESSMENT = ASSESSMENTS.A1.id; // IN_REVIEW — for the non-Draft 409 case
const B2 = FACILITIES.B2.id;
const B2_ASSESSMENT = ASSESSMENTS.B2.id; // other tenant — for cross-tenant 404

// A second Author on facility A2's assessment, so "suppression is per-Author"
// can be proven rather than asserted. Not in the shared fixture (only O6 needs
// two Authors on one assessment).
const SECOND_AUTHOR = { id: id(220), email: "author2.a2@a.example" };

// What the mocked model "returns" for the contextual half.
let modelFlags = [];

const checkUrl = (assessmentId) => `/api/assessments/${assessmentId}/anomaly-check`;
const ackUrl = (assessmentId) => `/api/assessments/${assessmentId}/anomaly-acknowledgements`;

async function setEntitlement(facilityId, enabled) {
  await db("facility_entitlements")
    .insert({ id: crypto.randomUUID(), facility_id: facilityId, feature_key: "anomaly_detection", enabled })
    .onConflict(["facility_id", "feature_key"])
    .merge({ enabled });
}

// Make the A2 asset trip exactly one deterministic rule
// (asset-criticality-consequences): Low criticality + a fatality consequence.
async function makeAssetAnomalous() {
  await db("assets")
    .where({ id: A2_ASSET })
    .update({
      criticality: "Low",
      details: JSON.stringify({ consequences: "Possible fatality in the control room" })
    });
}

async function seedSecondAuthor() {
  await db("users")
    .insert({
      id: SECOND_AUTHOR.id,
      email: SECOND_AUTHOR.email,
      password_hash: "$2a$04$0000000000000000000000000000000000000000000000000000",
      name: SECOND_AUTHOR.email
    })
    .onConflict("id")
    .ignore();
  await db("role_assignments")
    .insert({
      id: id(1220),
      user_id: SECOND_AUTHOR.id,
      facility_id: A2,
      operator_id: OPERATORS.A.id,
      role: ROLES.AUTHOR,
      cross_facility: false
    })
    .onConflict("id")
    .ignore();
  USERS.author2A2 = { id: SECOND_AUTHOR.id, email: SECOND_AUTHOR.email };
}

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  await seedSecondAuthor();
});

afterAll(async () => {
  if (ORIGINAL_AI_ENABLED === undefined) {
    delete process.env.AI_ENABLED;
  } else {
    process.env.AI_ENABLED = ORIGINAL_AI_ENABLED;
  }
  await db.destroy();
});

beforeEach(async () => {
  await db("anomaly_acknowledgements").del();
  await db("facility_entitlements").del();
  await db("ai_call_log").del();
  await db("audit_log_entries").del();
  await makeAssetAnomalous();
  await setEntitlement(A2, true);
  modelFlags = [];
  jest.restoreAllMocks();
  jest.spyOn(gateway, "callModel").mockImplementation(async ({ kind }) => {
    if (kind !== "object") {
      throw new Error(`unexpected gateway kind in anomaly suite: ${kind}`);
    }
    return {
      output: { flags: modelFlags },
      usage: { inputTokens: 400, outputTokens: 60 },
      reportedProvider: "meta",
      reportedModel: "meta/llama-3.3-70b"
    };
  });
});

describe("POST anomaly-check — the add-on entitlement gate", () => {
  test("entitlement disabled → 403 FEATURE_NOT_ENABLED, ZERO gateway calls and no flags at all", async () => {
    await setEntitlement(A2, false);
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FEATURE_NOT_ENABLED");
    expect(res.body.flags).toBeUndefined();
    expect(gateway.callModel).not.toHaveBeenCalled();
    expect(await db("ai_call_log").where({ facility_id: A2 })).toHaveLength(0);
    expect(await db("audit_log_entries").where({ action_type: "anomaly-flagged" })).toHaveLength(0);
  });

  test("no entitlement row at all → 403 (add-ons are off by default, never on)", async () => {
    await db("facility_entitlements").del();
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FEATURE_NOT_ENABLED");
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("enabling the entitlement flips the SAME request to 200 (read-time gating, no deploy)", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await setEntitlement(A2, false);
    expect((await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({})).status).toBe(403);

    await setEntitlement(A2, true);
    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.flags.map((f) => f.ruleKey)).toContain(RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES);
  });

  test("facility A2's entitlement does not enable facility B2 (isolation)", async () => {
    await setEntitlement(A2, true);
    const session = await login("authorB2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(B2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FEATURE_NOT_ENABLED");
  });
});

describe("POST anomaly-check — the hybrid engine", () => {
  test("returns deterministic flags, audits the raised set, and logs the AI call", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.llmAvailable).toBe(true);
    expect(res.body.flags).toHaveLength(1);
    expect(res.body.flags[0]).toMatchObject({
      ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
      entityType: "asset",
      entityId: A2_ASSET
    });

    const audit = await db("audit_log_entries").where({ action_type: "anomaly-flagged", assessment_id: A2_ASSESSMENT });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata.flags).toEqual([
      { ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES, entityType: "asset", entityId: A2_ASSET }
    ]);

    const call = await db("ai_call_log").where({ feature: "anomaly_detection", facility_id: A2 });
    expect(call).toHaveLength(1);
    expect(call[0].outcome).toBe("success");
  });

  test("merges the model's contextual flags with the deterministic ones", async () => {
    modelFlags = [
      { evaluationId: A2_EVAL, ruleKey: "scenario-threat-mismatch", message: "Scenario describes a cyber intrusion, not civil unrest." }
    ];
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.flags.map((f) => f.ruleKey).sort()).toEqual([
      RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
      "scenario-threat-mismatch"
    ]);
    expect(res.body.flags.find((f) => f.ruleKey === "scenario-threat-mismatch")).toMatchObject({
      entityType: "evaluation",
      entityId: A2_EVAL
    });
  });

  test("a model flag naming an evaluation we never sent is DISCARDED (untrusted output)", async () => {
    modelFlags = [
      { evaluationId: CHILD.B2.evaluation, ruleKey: "scenario-threat-mismatch", message: "cross-tenant id" },
      { evaluationId: crypto.randomUUID(), ruleKey: "mitigation-vulnerability-gap", message: "invented id" }
    ];
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.flags.map((f) => f.ruleKey)).toEqual([RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES]);
  });

  test("a clean assessment returns no flags and writes NO anomaly-flagged audit row", async () => {
    await db("assets").where({ id: A2_ASSET }).update({
      criticality: "High",
      details: JSON.stringify({ consequences: "Short loading delay" })
    });
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.flags).toEqual([]);
    expect(await db("audit_log_entries").where({ action_type: "anomaly-flagged" })).toHaveLength(0);
  });

  test("ADVISORY ONLY: an AI failure still returns the deterministic flags (200, llmAvailable false)", async () => {
    gateway.callModel.mockRejectedValue(new Error("gateway exploded"));
    const session = await login("authorA2", ROLES.AUTHOR);

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(200);
    expect(res.body.llmAvailable).toBe(false);
    expect(res.body.flags.map((f) => f.ruleKey)).toEqual([RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES]);
    // The failure is not swallowed — runAiCall still logged it for cost/tuning.
    const call = await db("ai_call_log").where({ feature: "anomaly_detection", facility_id: A2 });
    expect(call).toHaveLength(1);
    expect(call[0].outcome).not.toBe("success");
  });
});

describe("POST anomaly-acknowledgements — suppression is per-Author per-assessment (§9.2)", () => {
  const ackBody = {
    ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
    entityType: "asset",
    entityId: A2_ASSET,
    reason: "false_positive"
  };

  test("acknowledging suppresses the flag for THAT Author on the next check, and audits the dismissal", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);

    const ack = await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send(ackBody);
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgement).toMatchObject({ ruleKey: ackBody.ruleKey, reason: "false_positive" });

    const rows = await db("anomaly_acknowledgements").where({ assessment_id: A2_ASSESSMENT });
    expect(rows).toHaveLength(1);
    expect(rows[0].author_user_id).toBe(USERS.authorA2.id);

    const audit = await db("audit_log_entries").where({ action_type: "anomaly-acknowledged" });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ ruleKey: ackBody.ruleKey, reason: "false_positive" });

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});
    expect(res.body.flags).toEqual([]);
  });

  test("a SECOND Author on the same assessment still sees the acknowledged flag (fresh)", async () => {
    const first = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), first).send(ackBody);
    expect((await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), first).send({})).body.flags).toEqual([]);

    const second = await login("author2A2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), second).send({});

    expect(res.status).toBe(200);
    expect(res.body.flags.map((f) => f.ruleKey)).toEqual([RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES]);
  });

  test("an acknowledgement of a DIFFERENT rule/entity does not suppress this flag", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send({
      ...ackBody,
      ruleKey: RULE_KEYS.SEVERITY_VS_CRITICALITY
    });

    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});
    expect(res.body.flags.map((f) => f.ruleKey)).toEqual([RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES]);
  });

  test("re-acknowledging the same flag updates the reason in place (no duplicate row)", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send(ackBody);
    const res = await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send({
      ...ackBody,
      reason: "will_address"
    });

    expect(res.status).toBe(200);
    const rows = await db("anomaly_acknowledgements").where({ assessment_id: A2_ASSESSMENT });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("will_address");
    const audit = await db("audit_log_entries").where({ action_type: "anomaly-acknowledged" }).orderBy("created_at");
    expect(audit).toHaveLength(2);
    expect(audit[1].diff).toEqual({ reason: ["false_positive", "will_address"] });
  });

  test("reason 'other' without reasonText → 400 (Zod), nothing persisted", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send({ ...ackBody, reason: "other" });

    expect(res.status).toBe(400);
    expect(await db("anomaly_acknowledgements").where({ assessment_id: A2_ASSESSMENT })).toHaveLength(0);
  });

  test("an unknown reason outside the §9.2 picker → 400", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send({ ...ackBody, reason: "meh" });
    expect(res.status).toBe(400);
  });
});

describe("anomaly endpoints — role, state, tenant and auth gating", () => {
  test("unauthenticated → 401 on both endpoints", async () => {
    expect((await request(app).post(checkUrl(A2_ASSESSMENT)).send({})).status).toBe(401);
    expect((await request(app).post(ackUrl(A2_ASSESSMENT)).send({})).status).toBe(401);
  });

  // Every non-Author role that can SEE assessment A2 → 403. (approverA holds its
  // role on A1 only; the A1 case below covers the Approver.)
  test.each([
    ["reviewerA2", ROLES.REVIEWER],
    ["hqA", ROLES.HQ_EXECUTIVE],
    ["adminA", ROLES.ADMIN]
  ])("non-Author %s → 403 ROLE_NOT_ALLOWED, no gateway call", async (userKey, role) => {
    const session = await login(userKey, role);
    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("an Approver on the assessment's own facility → 403 (role is checked before state)", async () => {
    await setEntitlement(A1, true);
    const session = await login("approverA", ROLES.APPROVER);
    const res = await withAuth(request(app).post(checkUrl(A1_ASSESSMENT)), session).send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("a role scoped to another facility → 404 before any role check (no existence leak)", async () => {
    const session = await login("approverA", ROLES.APPROVER); // Approver on A1, not A2
    const res = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("Mitigation Owner → 403 on every anomaly endpoint (the §P4 AI matrix)", async () => {
    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const check = await withAuth(request(app).post(checkUrl(A2_ASSESSMENT)), session).send({});
    const ack = await withAuth(request(app).post(ackUrl(A2_ASSESSMENT)), session).send({});

    expect(check.status).toBe(403);
    expect(check.body.error.code).toBe("ROLE_NOT_ALLOWED");
    expect(ack.status).toBe(403);
    expect(ack.body.error.code).toBe("ROLE_NOT_ALLOWED");
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("a non-Draft assessment → 409 INVALID_ASSESSMENT_STATE, no gateway call", async () => {
    await setEntitlement(A1, true);
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(checkUrl(A1_ASSESSMENT)), session).send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_ASSESSMENT_STATE");
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("cross-tenant: an Op-A Author targeting an Op-B assessment → 404 (no existence leak), nothing written", async () => {
    await setEntitlement(B2, true);
    const session = await login("authorA2", ROLES.AUTHOR);

    const check = await withAuth(request(app).post(checkUrl(B2_ASSESSMENT)), session).send({});
    const ack = await withAuth(request(app).post(ackUrl(B2_ASSESSMENT)), session).send({
      ruleKey: RULE_KEYS.ASSET_CRITICALITY_CONSEQUENCES,
      entityType: "asset",
      entityId: CHILD.B2.asset,
      reason: "false_positive"
    });

    expect(check.status).toBe(404);
    expect(check.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
    expect(ack.status).toBe(404);
    expect(gateway.callModel).not.toHaveBeenCalled();
    expect(await db("anomaly_acknowledgements").where({ assessment_id: B2_ASSESSMENT })).toHaveLength(0);
  });
});
