// P4 · O7 — cross-facility consistency flagging integration suite (REAL Postgres;
// the job driven directly, the read surface through supertest). Gateway mocked at
// the callModel seam (kind 'text'), so no network.
//
// Proves the §P4 DoD for this feature:
//   - synthetic portfolio with a known 2σ outlier → flagged; non-outlier → not;
//   - operator-portfolio boundary respected: two operators seeded, NO cross-flagging
//     and no Op-B data in an Op-A prompt (§17.5 "cross-operator data leakage is a
//     critical security failure");
//   - only ENTITLED facilities enter clustering (F2 2026-07-04): one entitled +
//     one not → the non-entitled facility's data is absent from prompts AND flags;
//   - HQ read surface: portfolio-scoped, role-gated, dismiss/send-back audited.
//
// The shared fixture has 2 facilities per operator — too few for a peer norm — so
// this suite seeds its own portfolio (per-suite fixture data, §P2 deliverable 0).
const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
process.env.AI_ENABLED = "true";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const gateway = require("../../src/ai/gateway");
const { ROLES, ASSESSMENT_STATES } = require("../../src/services/constants");
const { runConsistencyFlagging } = require("../../src/jobs/consistencyFlagging");
const { loadPortfolioRows } = require("../../src/repositories/consistencyRepository");
const { OPERATORS, USERS, truncateAll, seedFixtures, id } = require("./fixtures");
const { login, withAuth } = require("./session");

const RATIONALE = "Maritime is rated far below peers; the stated rationale does not explain the gap. Worth review.";

// ── The synthetic portfolio ──────────────────────────────────────────────────
// Operator A gets 5 extra facilities, each with one assessment carrying one
// Maritime/Jetty evaluation. Ratings are the R1 product (consequence x likelihood):
//   P1 3x4 = 12 · P2 3x4 = 12 · P3 5x3 = 15 · P4 3x3 = 9   → peers, mean 12
//   P0 2x2 = 4                                             → the outlier (3.77σ)
// P5 belongs to operator A but is NOT entitled — it rates 25 (wildly divergent),
// so if the entitlement gate ever leaks it will both appear as a flag AND drag
// the peer norm. That is the point of its rating.
const PORTFOLIO = [
  { key: "P0", name: "Outlier Terminal", consequence: 2, likelihood: 2, entitled: true },
  { key: "P1", name: "Peer Alpha", consequence: 3, likelihood: 4, entitled: true },
  { key: "P2", name: "Peer Bravo", consequence: 3, likelihood: 4, entitled: true },
  { key: "P3", name: "Peer Charlie", consequence: 5, likelihood: 3, entitled: true },
  { key: "P4", name: "Peer Delta", consequence: 3, likelihood: 3, entitled: true },
  { key: "P5", name: "Unentitled Depot", consequence: 5, likelihood: 5, entitled: false }
];

// Operator B gets its own 4-facility portfolio with a would-be outlier, to prove
// the operator boundary: B's rows must never enter A's clusters or prompts.
const PORTFOLIO_B = [
  { key: "Q0", name: "B Outlier", consequence: 1, likelihood: 1, entitled: true },
  { key: "Q1", name: "B Peer One", consequence: 4, likelihood: 4, entitled: true },
  { key: "Q2", name: "B Peer Two", consequence: 4, likelihood: 4, entitled: true },
  { key: "Q3", name: "B Peer Three", consequence: 5, likelihood: 3, entitled: true }
];

let seq = 7000;
const nextId = () => id((seq += 1));

const ids = {}; // key → { facilityId, assessmentId, evaluationId }

async function seedPortfolio(entries, operatorKey) {
  for (const entry of entries) {
    const facilityId = nextId();
    const assessmentId = nextId();
    const assetId = nextId();
    const threatId = nextId();
    const evaluationId = nextId();
    const operatorId = OPERATORS[operatorKey].id;

    await db("facilities").insert({
      id: facilityId,
      operator_id: operatorId,
      name: entry.name,
      configuration: JSON.stringify({})
    });
    await db("assessments").insert({
      id: assessmentId,
      operator_id: operatorId,
      facility_id: facilityId,
      lead_author_user_id: USERS.authorA1.id,
      name: `${entry.name} — 2026 SRA`,
      state: ASSESSMENT_STATES.DRAFT,
      lock_version: 1,
      contributors: JSON.stringify([])
    });
    await db("assets").insert({
      id: assetId,
      facility_id: facilityId,
      assessment_id: assessmentId,
      name: `${entry.name} jetty`,
      asset_type: "Jetty",
      criticality: "High",
      details: JSON.stringify({})
    });
    await db("threats").insert({
      id: threatId,
      facility_id: facilityId,
      assessment_id: assessmentId,
      name: "Maritime",
      likelihood: entry.likelihood,
      details: JSON.stringify({ classification: "Maritime" })
    });
    await db("evaluations").insert({
      id: evaluationId,
      facility_id: facilityId,
      assessment_id: assessmentId,
      asset_id: assetId,
      threat_id: threatId,
      scenario: `${entry.name}: vessel-borne approach to the jetty.`,
      controls: "c",
      vulnerabilities: "v",
      proposed_mitigation: "m",
      r1: JSON.stringify({ consequence: entry.consequence, likelihood: entry.likelihood }),
      r2: JSON.stringify({})
    });
    if (entry.entitled) {
      await db("facility_entitlements").insert({
        id: crypto.randomUUID(),
        facility_id: facilityId,
        feature_key: "consistency_flagging",
        enabled: true
      });
    }
    ids[entry.key] = { facilityId, assessmentId, evaluationId, name: entry.name };
  }
}

// Every prompt the job sent this run — the evidence for "non-entitled / other
// operator data never reaches the model".
let prompts = [];

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  await seedPortfolio(PORTFOLIO, "A");
  await seedPortfolio(PORTFOLIO_B, "B");
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
  await db("consistency_flags").del();
  await db("ai_call_log").del();
  await db("audit_log_entries").del();
  prompts = [];
  jest.restoreAllMocks();
  jest.spyOn(gateway, "callModel").mockImplementation(async ({ kind, prompt }) => {
    if (kind !== "text") {
      throw new Error(`unexpected gateway kind in consistency suite: ${kind}`);
    }
    prompts.push(prompt);
    return {
      output: RATIONALE,
      usage: { inputTokens: 800, outputTokens: 90 },
      reportedProvider: "meta",
      reportedModel: "meta/llama-3.3-70b"
    };
  });
});

describe("the nightly job — outlier detection over a synthetic portfolio (§9.3)", () => {
  test("flags the known 2σ+ outlier with rationale, severity and drill-in ids; leaves peers unflagged", async () => {
    await runConsistencyFlagging({ conn: db });

    // Scoped to operator A: operator B has its own outlier by design (the
    // boundary tests below depend on it), so a global count would conflate them.
    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");
    expect(flags).toHaveLength(1);
    const flag = flags[0];
    expect(flag.facility_id).toBe(ids.P0.facilityId);
    expect(flag.assessment_id).toBe(ids.P0.assessmentId);
    expect(flag.evaluation_id).toBe(ids.P0.evaluationId);
    expect(flag.operator_id).toBe(OPERATORS.A.id);
    expect(flag.cluster_key).toBe("maritime::jetty");
    expect(Number(flag.divergence_sigma)).toBeCloseTo(3.771, 2);
    expect(flag.severity).toBe("high");
    expect(flag.status).toBe("pending");
    expect(flag.rationale).toBe(RATIONALE);
  });

  test("the AI call is OPERATOR-scoped (HQ budget), runs as system, and is logged", async () => {
    await runConsistencyFlagging({ conn: db });

    const calls = await db("ai_call_log").where({ feature: "consistency_flagging", operator_id: OPERATORS.A.id });
    expect(calls).toHaveLength(1);
    expect(calls[0].operator_id).toBe(OPERATORS.A.id);
    expect(calls[0].facility_id).toBeNull(); // never bills a facility
    expect(calls[0].user_id).toBe("system");
    expect(calls[0].outcome).toBe("success");
  });

  test("ADVISORY: an AI failure still stores the divergence, with a null rationale", async () => {
    gateway.callModel.mockRejectedValue(new Error("gateway exploded"));

    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");
    expect(flags).toHaveLength(1);
    expect(flags[0].facility_id).toBe(ids.P0.facilityId);
    expect(flags[0].rationale).toBeNull();
    // The failure is recorded rather than swallowed.
    const calls = await db("ai_call_log").where({ feature: "consistency_flagging" });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.outcome !== "success")).toBe(true);
  });

  test("a facility with TWO assessments sharing a created_at contributes ONE, never a blend of both", async () => {
    // Postgres now() is the transaction timestamp, so a facility's SRAs seeded in
    // one transaction share created_at exactly (db/seed.js writes Bonny's 2026 and
    // 2025 SRAs that way, and O8 provisioning will too). A max(created_at) join
    // matches BOTH and averages two years into one facility's value — a silent
    // corruption of every peer norm. The tie is forced in SQL: reading the
    // timestamp into a JS Date truncates microseconds and would not actually tie.
    const olderAssessmentId = nextId();
    const olderAssetId = nextId();
    const olderThreatId = nextId();
    const olderEvalId = nextId();

    await db("assessments").insert({
      id: olderAssessmentId,
      operator_id: OPERATORS.A.id,
      facility_id: ids.P1.facilityId, // same facility as Peer Alpha
      lead_author_user_id: USERS.authorA1.id,
      name: "Peer Alpha — 2025 SRA",
      state: ASSESSMENT_STATES.APPROVED,
      lock_version: 1,
      contributors: JSON.stringify([])
    });
    await db.raw(
      "UPDATE assessments SET created_at = timestamptz '2026-01-01 00:00:00+00' WHERE id IN (?, ?)",
      [olderAssessmentId, ids.P1.assessmentId]
    );
    await db("assets").insert({
      id: olderAssetId,
      facility_id: ids.P1.facilityId,
      assessment_id: olderAssessmentId,
      name: "Peer Alpha jetty",
      asset_type: "Jetty",
      criticality: "High",
      details: JSON.stringify({})
    });
    await db("threats").insert({
      id: olderThreatId,
      facility_id: ids.P1.facilityId,
      assessment_id: olderAssessmentId,
      name: "Maritime",
      likelihood: 1,
      details: JSON.stringify({ classification: "Maritime" })
    });
    await db("evaluations").insert({
      id: olderEvalId,
      facility_id: ids.P1.facilityId,
      assessment_id: olderAssessmentId,
      asset_id: olderAssetId,
      threat_id: olderThreatId,
      scenario: "Peer Alpha 2025: historical rating.",
      controls: "c",
      vulnerabilities: "v",
      proposed_mitigation: "m",
      r1: JSON.stringify({ consequence: 1, likelihood: 1 }), // rating 1 vs the live 12
      r2: JSON.stringify({})
    });

    // Which of two tied assessments wins is arbitrary; that exactly ONE wins is
    // the invariant. Blending would give Peer Alpha (12 + 1) / 2 = 6.5, silently
    // moving every peer norm it takes part in.
    const rows = await loadPortfolioRows({
      operatorId: OPERATORS.A.id,
      facilityIds: [ids.P1.facilityId],
      conn: db
    });

    expect(rows).toHaveLength(1);
    expect([12, 1]).toContain(rows[0].rating);

    await db("assessments").where({ id: olderAssessmentId }).del();
    await db.raw("UPDATE assessments SET created_at = now() WHERE id = ?", [ids.P1.assessmentId]);
  });

  test("unrated and consequence-0 evaluations carry rating null — never a clustered 0 (sweep fix 2026-07-16)", async () => {
    // The client writes unrated rows as { consequence: null, likelihood: null }
    // (adapters.js), and consequence 0 is the matrix's explicit "no consequence"
    // (riskMatrixService → score null). Number(null) is 0, so without the axis
    // guard these cluster as rating 0 and manufacture a 4.5σ outlier out of
    // missing data.
    const extra = [
      { r1: { consequence: null, likelihood: null } },
      { r1: { consequence: 0, likelihood: 3 } }
    ].map((e) => ({ ...e, evaluationId: nextId(), assetId: nextId(), threatId: nextId() }));

    for (const e of extra) {
      await db("assets").insert({
        id: e.assetId, facility_id: ids.P1.facilityId, assessment_id: ids.P1.assessmentId,
        name: "extra jetty", asset_type: "Jetty", criticality: "High", details: JSON.stringify({})
      });
      await db("threats").insert({
        id: e.threatId, facility_id: ids.P1.facilityId, assessment_id: ids.P1.assessmentId,
        name: "Maritime", likelihood: 3, details: JSON.stringify({ classification: "Maritime" })
      });
      await db("evaluations").insert({
        id: e.evaluationId, facility_id: ids.P1.facilityId, assessment_id: ids.P1.assessmentId,
        asset_id: e.assetId, threat_id: e.threatId, scenario: "unrated row", controls: "c",
        vulnerabilities: "v", proposed_mitigation: "m", r1: JSON.stringify(e.r1), r2: JSON.stringify({})
      });
    }

    const rows = await loadPortfolioRows({
      operatorId: OPERATORS.A.id,
      facilityIds: [ids.P1.facilityId],
      conn: db
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.rating).sort()).toEqual([12, null, null]);

    // End to end: Peer Alpha's cluster value stays 12 (mean of RATED rows only),
    // so the peer norm and the outlier verdict are unchanged.
    await runConsistencyFlagging({ conn: db });
    expect(prompts[0]).toContain("mean rating 12.0");

    for (const e of extra) {
      await db("evaluations").where({ id: e.evaluationId }).del();
      await db("threats").where({ id: e.threatId }).del();
      await db("assets").where({ id: e.assetId }).del();
    }
  });

  test("an expired flag whose divergence RE-EMERGES returns to pending (never stuck invisible)", async () => {
    await runConsistencyFlagging({ conn: db });

    // Night 2: the Author re-rates in line with peers → the flag expires.
    await db("evaluations")
      .where({ id: ids.P0.evaluationId })
      .update({ r1: JSON.stringify({ consequence: 3, likelihood: 4 }) });
    await runConsistencyFlagging({ conn: db });
    expect((await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).first()).status).toBe("expired");

    // Night 3: the Author reverts — the divergence is real again and the SAME
    // row (natural key) must come back to pending, or it is invisible forever.
    await db("evaluations")
      .where({ id: ids.P0.evaluationId })
      .update({ r1: JSON.stringify({ consequence: 2, likelihood: 2 }) });
    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.A.id });
    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe("pending");
  });

  test("a re-emerging divergence does NOT revive a HUMAN status (dismissed stays dismissed)", async () => {
    await runConsistencyFlagging({ conn: db });
    await db("consistency_flags")
      .where({ operator_id: OPERATORS.A.id })
      .update({ status: "dismissed", dismissed_reason: "known local factor" });

    await runConsistencyFlagging({ conn: db });

    const flag = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).first();
    expect(flag.status).toBe("dismissed");
  });

  test("re-running the job is idempotent: the flag is refreshed, not duplicated", async () => {
    await runConsistencyFlagging({ conn: db });
    const first = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");

    await runConsistencyFlagging({ conn: db });
    const second = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  test("a nightly re-run does NOT resurrect a dismissed flag", async () => {
    await runConsistencyFlagging({ conn: db });
    await db("consistency_flags")
      .where({ operator_id: OPERATORS.A.id })
      .update({ status: "dismissed", dismissed_reason: "known local factor" });

    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");
    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe("dismissed");
    expect(flags[0].dismissed_reason).toBe("known local factor");
  });

  test("a pending flag whose divergence is gone becomes 'expired' on the next run", async () => {
    await runConsistencyFlagging({ conn: db });
    expect(await db("consistency_flags").where({ status: "pending", operator_id: OPERATORS.A.id })).toHaveLength(1);

    // The Author re-rates the outlier in line with its peers (3x4 = 12).
    await db("evaluations")
      .where({ id: ids.P0.evaluationId })
      .update({ r1: JSON.stringify({ consequence: 3, likelihood: 4 }) });

    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.A.id }).select("*");
    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe("expired");

    // Restore for the other tests in this file.
    await db("evaluations")
      .where({ id: ids.P0.evaluationId })
      .update({ r1: JSON.stringify({ consequence: 2, likelihood: 2 }) });
  });
});

describe("the nightly job — entitlement and operator boundaries", () => {
  test("a NON-entitled facility never enters clustering: absent from flags AND from every prompt", async () => {
    await runConsistencyFlagging({ conn: db });

    const flagged = await db("consistency_flags").select("facility_id");
    expect(flagged.map((f) => f.facility_id)).not.toContain(ids.P5.facilityId);

    // Its data reached no model, either as a subject or as a peer.
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt).not.toContain("Unentitled Depot");
    }
  });

  test("the non-entitled facility does not drag the peer norm (its 25 rating is excluded)", async () => {
    await runConsistencyFlagging({ conn: db });

    // Peers are 12/12/15/9 → mean 12. Had the unentitled 25 been included the
    // mean would be 14.6 and this figure would move.
    const flag = await db("consistency_flags").first();
    expect(prompts[0]).toContain("mean rating 12.0");
    expect(Number(flag.divergence_sigma)).toBeCloseTo(3.771, 2);
  });

  test("operator boundary: Op-B facilities are never flagged into Op-A, and never appear in an Op-A prompt", async () => {
    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").select("*");
    // Op-B's portfolio has only 4 entitled facilities and its own outlier — it is
    // processed separately, never merged into A's cluster.
    const aFlags = flags.filter((f) => f.operator_id === OPERATORS.A.id);
    const bFlags = flags.filter((f) => f.operator_id === OPERATORS.B.id);
    for (const f of aFlags) {
      expect([ids.P0, ids.P1, ids.P2, ids.P3, ids.P4].map((p) => p.facilityId)).toContain(f.facility_id);
    }
    for (const f of bFlags) {
      expect([ids.Q0, ids.Q1, ids.Q2, ids.Q3].map((p) => p.facilityId)).toContain(f.facility_id);
    }

    // No prompt mixes the two portfolios.
    for (const prompt of prompts) {
      const hasA = /Peer Alpha|Outlier Terminal/.test(prompt);
      const hasB = /B Peer|B Outlier/.test(prompt);
      expect(hasA && hasB).toBe(false);
    }
  });

  test("an operator dropping below the floor expires its pending flags rather than stranding them", async () => {
    await runConsistencyFlagging({ conn: db });
    expect(await db("consistency_flags").where({ operator_id: OPERATORS.B.id, status: "pending" })).toHaveLength(1);

    // B falls to 3 entitled facilities — no norm is computable, so its existing
    // pending flag is unbacked and must not sit on the HQ dashboard forever.
    await db("facility_entitlements").where({ facility_id: ids.Q3.facilityId }).update({ enabled: false });
    await runConsistencyFlagging({ conn: db });

    const flags = await db("consistency_flags").where({ operator_id: OPERATORS.B.id });
    expect(flags).toHaveLength(1);
    expect(flags[0].status).toBe("expired");

    await db("facility_entitlements").where({ facility_id: ids.Q3.facilityId }).update({ enabled: true });
  });

  test("an operator with too few entitled facilities is skipped entirely — no flags, no AI spend", async () => {
    // Op-B has exactly 4 entitled; drop one to fall under the floor.
    await db("facility_entitlements").where({ facility_id: ids.Q3.facilityId }).update({ enabled: false });

    await runConsistencyFlagging({ conn: db });

    expect(await db("consistency_flags").where({ operator_id: OPERATORS.B.id })).toHaveLength(0);
    expect(await db("ai_call_log").where({ operator_id: OPERATORS.B.id })).toHaveLength(0);

    await db("facility_entitlements").where({ facility_id: ids.Q3.facilityId }).update({ enabled: true });
  });
});

describe("GET /api/assessments/consistency-flags — the HQ read surface (§17.5)", () => {
  beforeEach(async () => {
    await runConsistencyFlagging({ conn: db });
  });

  test("an HQ Executive sees their operator's flags, with facility name and rationale", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments/consistency-flags"), session);

    expect(res.status).toBe(200);
    expect(res.body.flags.length).toBeGreaterThan(0);
    const flag = res.body.flags.find((f) => f.facilityId === ids.P0.facilityId);
    expect(flag).toMatchObject({
      facilityName: "Outlier Terminal",
      severity: "high",
      status: "pending",
      rationale: RATIONALE
    });
    expect(flag.assessmentId).toBe(ids.P0.assessmentId); // the drill-in link
  });

  test("an HQ Executive NEVER sees another operator's flags", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments/consistency-flags"), session);

    const operatorBFacilities = [ids.Q0, ids.Q1, ids.Q2, ids.Q3].map((p) => p.facilityId);
    for (const flag of res.body.flags) {
      expect(operatorBFacilities).not.toContain(flag.facilityId);
    }
    expect(JSON.stringify(res.body)).not.toContain("B Outlier");
  });

  test("the status filter narrows the list", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const pending = await withAuth(
      request(app).get("/api/assessments/consistency-flags?status=pending"),
      session
    );
    const dismissed = await withAuth(
      request(app).get("/api/assessments/consistency-flags?status=dismissed"),
      session
    );

    expect(pending.body.flags.length).toBeGreaterThan(0);
    expect(dismissed.body.flags).toEqual([]);
  });

  test("an invalid status filter → 400", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments/consistency-flags?status=banana"), session);
    expect(res.status).toBe(400);
  });

  test("unauthenticated → 401", async () => {
    expect((await request(app).get("/api/assessments/consistency-flags")).status).toBe(401);
  });

  test.each([
    ["authorA1", ROLES.AUTHOR],
    ["reviewerA1", ROLES.REVIEWER],
    ["approverA", ROLES.APPROVER],
    ["adminA", ROLES.ADMIN],
    ["mitA", ROLES.MITIGATION_OWNER]
  ])("non-HQ role %s → 403 ROLE_NOT_ALLOWED (§9.3 gates the dashboard on HQ Executive)", async (userKey, role) => {
    const session = await login(userKey, role);
    const res = await withAuth(request(app).get("/api/assessments/consistency-flags"), session);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("the literal path is not swallowed by GET /:assessmentId (route order regression)", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get("/api/assessments/consistency-flags"), session);
    // A swallowed route would 400 on uuid validation instead of returning flags.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.flags)).toBe(true);
  });
});

describe("PATCH /api/assessments/consistency-flags/:flagId — dismiss / send back (§9.3)", () => {
  let flagId;

  beforeEach(async () => {
    await runConsistencyFlagging({ conn: db });
    const flag = await db("consistency_flags").where({ facility_id: ids.P0.facilityId }).first();
    flagId = flag.id;
  });

  test("dismiss with a reason → status + reason persisted, audited with the old→new status", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
      status: "dismissed",
      dismissedReason: "Local pilotage regime justifies the lower rating"
    });

    expect(res.status).toBe(200);
    expect(res.body.flag).toMatchObject({ status: "dismissed" });

    const row = await db("consistency_flags").where({ id: flagId }).first();
    expect(row.status).toBe("dismissed");
    expect(row.dismissed_reason).toBe("Local pilotage regime justifies the lower rating");
    expect(row.dismissed_by).toBe(USERS.hqA.id);

    const audit = await db("audit_log_entries").where({ action_type: "consistency-flag-dismissed" });
    expect(audit).toHaveLength(1);
    expect(audit[0].diff).toEqual({ status: ["pending", "dismissed"] });
    expect(audit[0].facility_id).toBe(ids.P0.facilityId);
  });

  test("send back to the Author → status sent_back, audited under its own action type", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
      status: "sent_back"
    });

    expect(res.status).toBe(200);
    expect((await db("consistency_flags").where({ id: flagId }).first()).status).toBe("sent_back");
    expect(await db("audit_log_entries").where({ action_type: "consistency-flag-sent-back" })).toHaveLength(1);
  });

  test("dismiss without a reason → 400 (§9.3: dismiss WITH reason), nothing changed", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
      status: "dismissed"
    });

    expect(res.status).toBe(400);
    expect((await db("consistency_flags").where({ id: flagId }).first()).status).toBe("pending");
  });

  test("a job-only status (expired / pending) cannot be set by hand → 400", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    for (const status of ["expired", "pending"]) {
      const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
        status
      });
      expect(res.status).toBe(400);
    }
  });

  test("cross-operator: an Op-B HQ Executive patching an Op-A flag → 404, row unchanged", async () => {
    const session = await login("hqB", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
      status: "dismissed",
      dismissedReason: "not mine to dismiss"
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("FLAG_NOT_FOUND");
    expect((await db("consistency_flags").where({ id: flagId }).first()).status).toBe("pending");
  });

  test("a non-HQ role → 403, row unchanged", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).patch(`/api/assessments/consistency-flags/${flagId}`), session).send({
      status: "sent_back"
    });

    expect(res.status).toBe(403);
    expect((await db("consistency_flags").where({ id: flagId }).first()).status).toBe("pending");
  });

  test("an unknown flag id → 404", async () => {
    const session = await login("hqA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(
      request(app).patch(`/api/assessments/consistency-flags/${crypto.randomUUID()}`),
      session
    ).send({ status: "sent_back" });

    expect(res.status).toBe(404);
  });
});
