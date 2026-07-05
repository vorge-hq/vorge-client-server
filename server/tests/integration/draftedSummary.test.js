// P4 · O5 — AI-drafted Executive Summary / Conclusion integration suite
// (supertest + REAL Postgres). Gateway mocked at the callModel seam (kind
// 'text'), no network. Proves the §P4/§9.1 DoD: role/state gating (403 for
// non-Authors, 409 on an Approved assessment, Mitigation Owner 403), only
// sections 1 & 8 draftable, and the AI ORIGINAL retained in the audit
// (`ai-draft-generated`.metadata.draftText) so it sits next to the edited final
// saved via the normal section-save path.
const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
process.env.AI_ENABLED = "true";

const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const gateway = require("../../src/ai/gateway");
const { ROLES, ASSESSMENT_STATES } = require("../../src/services/constants");
const { FACILITIES, ASSESSMENTS, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A2 = FACILITIES.A2.id;
const A2_ASSESSMENT = ASSESSMENTS.A2.id; // Draft, Author = authorA2
const A1_ASSESSMENT = ASSESSMENTS.A1.id; // IN_REVIEW
const B2_ASSESSMENT = ASSESSMENTS.B2.id; // other tenant

const DRAFT_TEXT = "Paragraph one about the assessment.\n\nParagraph two about residual risk.";

const draftUrl = (assessmentId, n) => `/api/assessments/${assessmentId}/sections/${n}/generate-draft`;

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
  await db("ai_call_log").del();
  await db("audit_log_entries").del();
  jest.restoreAllMocks();
  jest.spyOn(gateway, "callModel").mockImplementation(async ({ kind }) => {
    if (kind !== "text") {
      throw new Error(`unexpected gateway kind in drafted-summary suite: ${kind}`);
    }
    return {
      output: DRAFT_TEXT,
      usage: { inputTokens: 2500, outputTokens: 700 },
      reportedProvider: "meta",
      reportedModel: "meta/llama-3.3-70b"
    };
  });
});

describe("POST generate-draft", () => {
  test("Author on a Draft assessment gets a draft; the AI original is retained in the audit", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 1)), session).send({});
    expect(res.status).toBe(200);
    expect(res.body.draft).toBe(DRAFT_TEXT);
    expect(res.body.sectionNumber).toBe(1);

    // AI original in the audit row, NOT written to the section (no section edit yet).
    const audit = await db("audit_log_entries").where({ action_type: "ai-draft-generated", assessment_id: A2_ASSESSMENT });
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata.draftText).toBe(DRAFT_TEXT);
    expect(audit[0].metadata.sectionNumber).toBe(1);

    const call = await db("ai_call_log").where({ feature: "drafted_summary", facility_id: A2 });
    expect(call).toHaveLength(1);
    expect(call[0].outcome).toBe("success");
  });

  test("the AI original sits next to the edited final saved via the section path", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 1)), session).send({});

    // Author edits and saves through the normal §P3 section path.
    const edited = `${DRAFT_TEXT}\n\nEdited by the author before submitting.`;
    const save = await withAuth(request(app).put(`/api/assessments/${A2_ASSESSMENT}/sections/1`), session).send({
      lockVersion: 1,
      contentText: edited
    });
    expect(save.status).toBe(200);

    const aiOriginal = await db("audit_log_entries").where({ action_type: "ai-draft-generated" }).first();
    const editedFinal = await db("audit_log_entries").where({ action_type: "section-text-updated" }).first();
    expect(aiOriginal.metadata.draftText).toBe(DRAFT_TEXT);
    expect(editedFinal).toBeTruthy();
    const section = await db("assessment_sections").where({ assessment_id: A2_ASSESSMENT, section_number: 1 }).first();
    expect(section.content_text).toBe(edited);
  });

  test("the prompt derives a real risk distribution from the stored {consequence,likelihood} shape", async () => {
    // The seeded A2 evaluation carries a real risk bag; a 5×4 = 20 → Very High.
    await db("evaluations")
      .where({ assessment_id: A2_ASSESSMENT })
      .update({ r1: JSON.stringify({ consequence: 5, likelihood: 4 }) });

    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 1)), session).send({});
    expect(res.status).toBe(200);

    const prompt = gateway.callModel.mock.calls[0][0].prompt;
    expect(prompt).toContain("Very High: 1");
    expect(prompt).toContain("[Very High]");
  });

  test("section 8 (Conclusion) is draftable too", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 8)), session).send({});
    expect(res.status).toBe(200);
    expect(res.body.sectionNumber).toBe(8);
  });

  test("a non-draftable section number → 400 before any AI call", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 2)), session).send({});
    expect(res.status).toBe(400);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("non-Author acting role → 403, no gateway call", async () => {
    const session = await login("reviewerA2", ROLES.REVIEWER);
    const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 1)), session).send({});
    expect(res.status).toBe(403);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("Approved assessment → 409, no gateway call", async () => {
    // Move A2 to Approved for this test, then restore.
    await db("assessments").where({ id: A2_ASSESSMENT }).update({ state: ASSESSMENT_STATES.APPROVED });
    try {
      const session = await login("authorA2", ROLES.AUTHOR);
      const res = await withAuth(request(app).post(draftUrl(A2_ASSESSMENT, 1)), session).send({});
      expect(res.status).toBe(409);
      expect(gateway.callModel).not.toHaveBeenCalled();
    } finally {
      await db("assessments").where({ id: A2_ASSESSMENT }).update({ state: ASSESSMENT_STATES.DRAFT });
    }
  });

  test("Mitigation Owner → 403 (AI endpoint matrix), no gateway call", async () => {
    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await withAuth(request(app).post(draftUrl(A1_ASSESSMENT, 1)), session).send({});
    expect(res.status).toBe(403);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("cross-tenant assessment → 404, no gateway call", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await withAuth(request(app).post(draftUrl(B2_ASSESSMENT, 1)), session).send({});
    expect(res.status).toBe(404);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });
});
