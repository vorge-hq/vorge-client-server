// P4 · O4 — smart tagging integration suite (supertest + REAL Postgres). Gateway
// mocked at the callModel seam (kind 'object'), so no network. Proves the §P4
// smart-tagging DoD: out-of-vocabulary tags DISCARDED (model returns 2 valid +
// 2 invalid → exactly 2 persist), the suggested and confirmed sets audited
// SEPARATELY (ai-tags-suggested / tags-confirmed), Author+Draft gating, the
// Mitigation Owner × AI endpoint 403, and cross-tenant 404.
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
const { FACILITIES, ASSESSMENTS, CHILD, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = FACILITIES.A2.id; // Draft assessment, Author = authorA2
const A2_ASSESSMENT = ASSESSMENTS.A2.id;
const A2_EVAL = CHILD.A2.evaluation;
const A1_ASSESSMENT = ASSESSMENTS.A1.id; // IN_REVIEW — for the non-Draft 409 case
const A1_EVAL = CHILD.A1.evaluation;
const B2_ASSESSMENT = ASSESSMENTS.B2.id; // other tenant — for cross-tenant 404
const B2_EVAL = CHILD.B2.evaluation;

// The facility's controlled vocabulary for these tests.
const VOCAB = [
  { category: "threat_type", value: "Insider" },
  { category: "threat_type", value: "Terrorism" },
  { category: "asset_class", value: "Control Room" }
];

// What the mocked model "returns": two in-vocab + two out-of-vocab strings.
let modelTags = ["Insider", "Terrorism", "Sabotage", "Nonsense"];

async function seedVocab(facilityId, rows) {
  await db("tag_vocabulary")
    .insert(rows.map((r) => ({ id: crypto.randomUUID(), facility_id: facilityId, category: r.category, value: r.value })))
    .onConflict(["facility_id", "category", "value"])
    .ignore();
}

const suggestUrl = (assessmentId, evalId) => `/api/assessments/${assessmentId}/evaluations/${evalId}/suggest-tags`;
const confirmUrl = (assessmentId, evalId) => `/api/assessments/${assessmentId}/evaluations/${evalId}/tags/confirm`;
const tagsUrl = (assessmentId, evalId) => `/api/assessments/${assessmentId}/evaluations/${evalId}/tags`;

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
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
  await db("scenario_tags").del();
  await db("tag_vocabulary").del();
  await db("ai_call_log").del();
  // Audit rows accrue across tests otherwise (they aren't part of the fixture
  // reset); clear so per-test audit-row counts are exact.
  await db("audit_log_entries").del();
  await seedVocab(A2, VOCAB);
  modelTags = ["Insider", "Terrorism", "Sabotage", "Nonsense"];
  jest.restoreAllMocks();
  jest.spyOn(gateway, "callModel").mockImplementation(async ({ kind }) => {
    if (kind !== "object") {
      throw new Error(`unexpected gateway kind in tagging suite: ${kind}`);
    }
    return {
      output: { tags: modelTags },
      usage: { inputTokens: 300, outputTokens: 50 },
      reportedProvider: "meta",
      reportedModel: "meta/llama-3.3-70b"
    };
  });
});

describe("POST suggest-tags", () => {
  test("persists ONLY the in-vocabulary tags (2 of 4) and audits the suggested set", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    expect(res.status).toBe(200);
    expect(res.body.tags.map((t) => t.value).sort()).toEqual(["Insider", "Terrorism"]);
    expect(res.body.tags.every((t) => t.source === "ai" && t.status === "suggested")).toBe(true);

    const rows = await db("scenario_tags").where({ evaluation_id: A2_EVAL });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "suggested" && r.source === "ai")).toBe(true);

    const audit = await db("audit_log_entries").where({ action_type: "ai-tags-suggested", assessment_id: A2_ASSESSMENT });
    expect(audit).toHaveLength(1);
    const metaTags = (audit[0].metadata.tags || []).map((t) => t.value).sort();
    expect(metaTags).toEqual(["Insider", "Terrorism"]);

    const call = await db("ai_call_log").where({ feature: "smart_tagging", facility_id: A2 });
    expect(call).toHaveLength(1);
    expect(call[0].outcome).toBe("success");
  });

  test("re-suggest replaces prior AI suggestions rather than stacking them", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    modelTags = ["Terrorism", "Control Room"];
    await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});

    const rows = await db("scenario_tags").where({ evaluation_id: A2_EVAL, status: "suggested" });
    expect(rows.map((r) => r.tag_value).sort()).toEqual(["Control Room", "Terrorism"]);
  });

  test("a previously-removed tag can be revived by a later suggest", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    // Confirm an empty set → Insider + Terrorism become `removed`.
    await withAuth(request(app).post(confirmUrl(A2_ASSESSMENT, A2_EVAL)), session).send({ tags: [] });
    expect(await db("scenario_tags").where({ evaluation_id: A2_EVAL, status: "removed" })).toHaveLength(2);

    // Re-suggest returns Insider again → it should resurface as a suggestion.
    modelTags = ["Insider"];
    const res = await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    expect(res.body.tags.map((t) => t.value)).toEqual(["Insider"]);
    const revived = await db("scenario_tags").where({ evaluation_id: A2_EVAL, tag_value: "Insider" }).first();
    expect(revived.status).toBe("suggested");
    expect(revived.source).toBe("ai");
  });

  test("non-Author acting role → 403, no gateway call", async () => {
    const session = await login("reviewerA2", ROLES.REVIEWER);
    const res = await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    expect(res.status).toBe(403);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("assessment not in Draft → 409, no gateway call", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(suggestUrl(A1_ASSESSMENT, A1_EVAL)), session).send({});
    expect(res.status).toBe(409);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("Mitigation Owner → 403 (AI endpoint matrix), no gateway call", async () => {
    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await withAuth(request(app).post(suggestUrl(A1_ASSESSMENT, A1_EVAL)), session).send({});
    expect(res.status).toBe(403);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("cross-tenant assessment → 404, no gateway call", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(suggestUrl(B2_ASSESSMENT, B2_EVAL)), session).send({});
    expect(res.status).toBe(404);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });
});

describe("POST tags/confirm", () => {
  test("persists the Author's chosen set as confirmed and audits it separately", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});

    // Keep Insider (AI), drop Terrorism, add a manual in-vocab tag.
    const res = await withAuth(request(app).post(confirmUrl(A2_ASSESSMENT, A2_EVAL)), session).send({
      tags: [
        { category: "threat_type", value: "Insider", source: "ai" },
        { category: "asset_class", value: "Control Room", source: "manual" }
      ]
    });
    expect(res.status).toBe(200);
    expect(res.body.tags.map((t) => t.value).sort()).toEqual(["Control Room", "Insider"]);
    expect(res.body.tags.every((t) => t.status === "confirmed")).toBe(true);

    const confirmed = await db("scenario_tags").where({ evaluation_id: A2_EVAL, status: "confirmed" });
    expect(confirmed.map((r) => r.tag_value).sort()).toEqual(["Control Room", "Insider"]);
    // Terrorism was dropped → removed, not confirmed.
    const removed = await db("scenario_tags").where({ evaluation_id: A2_EVAL, tag_value: "Terrorism", status: "removed" });
    expect(removed).toHaveLength(1);

    const audit = await db("audit_log_entries").where({ action_type: "tags-confirmed", assessment_id: A2_ASSESSMENT });
    expect(audit).toHaveLength(1);
    expect((audit[0].metadata.tags || []).map((t) => t.value).sort()).toEqual(["Control Room", "Insider"]);
  });

  test("discards out-of-vocabulary tags submitted at confirm time", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(confirmUrl(A2_ASSESSMENT, A2_EVAL)), session).send({
      tags: [
        { category: "threat_type", value: "Insider", source: "manual" },
        { category: "threat_type", value: "Made Up", source: "manual" }
      ]
    });
    expect(res.status).toBe(200);
    expect(res.body.tags.map((t) => t.value)).toEqual(["Insider"]);
  });
});

describe("GET tags", () => {
  test("returns the evaluation's non-removed tags", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(suggestUrl(A2_ASSESSMENT, A2_EVAL)), session).send({});
    const res = await withAuth(request(app).get(tagsUrl(A2_ASSESSMENT, A2_EVAL)), session);
    expect(res.status).toBe(200);
    expect(res.body.tags.map((t) => t.value).sort()).toEqual(["Insider", "Terrorism"]);
  });

  test("an evaluation id not belonging to the assessment URL → 404 (no cross-assessment read)", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    // A1_EVAL belongs to the A1 assessment, not A2 — even though the caller has
    // A-operator visibility, the per-assessment invariant must hold.
    const res = await withAuth(request(app).get(tagsUrl(A2_ASSESSMENT, A1_EVAL)), session);
    expect(res.status).toBe(404);
  });
});
