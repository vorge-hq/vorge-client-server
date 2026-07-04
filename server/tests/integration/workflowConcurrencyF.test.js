// P3 · (f) — withdraw/recall race (closes the AGENTS.md recall-race concern),
// Lead Author reassignment (§5.5), and mitigation owner assignment (§7).
// supertest + REAL Postgres.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES } = require("../../src/services/constants");
const { ACTIONS } = require("../../src/services/assessmentStateMachine");
const { ASSESSMENTS, CHILD, FACILITIES, OPERATORS, USERS, id, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A1 = ASSESSMENTS.A1; // In Review, facility A1, lead author authorA1
const A2 = ASSESSMENTS.A2; // Draft, facility A2, lead author authorA2

async function lockVersionOf(assessmentId) {
  return (await db("assessments").where({ id: assessmentId }).first()).lock_version;
}
async function setState(assessmentId, state) {
  await db("assessments").where({ id: assessmentId }).update({ state });
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
  // A second Author at facility A2 to serve as a valid reassignment target
  // (fixtures seed only one Author per facility).
  await db("role_assignments").insert({
    id: id(9001),
    user_id: USERS.authorA1.id,
    facility_id: FACILITIES.A2.id,
    operator_id: OPERATORS.A.id,
    role: ROLES.AUTHOR,
    cross_facility: false
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Withdraw / recall race (test-specs §P3)", () => {
  test("Author withdraws (In Review→Draft) with matching lockVersion -> 200; Reviewer's later complete_review -> 409", async () => {
    const v = await lockVersionOf(A1.id);
    const withdraw = await withAuth(request(app).post(`/api/assessments/${A1.id}/workflow`), await login("authorA1", ROLES.AUTHOR))
      .send({ action: ACTIONS.WITHDRAW_TO_DRAFT, reason: "needs more work", lockVersion: v });
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.assessment.state).toBe("Draft");

    // The Reviewer acted too late — the assessment already left In Review.
    const review = await withAuth(request(app).post(`/api/assessments/${A1.id}/workflow`), await login("reviewerA1", ROLES.REVIEWER))
      .send({ action: ACTIONS.COMPLETE_REVIEW });
    expect(review.status).toBe(409);
    expect(review.body.error.code).toBe("INVALID_ASSESSMENT_STATE");
  });

  test("Withdraw with a stale lockVersion -> 409 (the 'someone already acted' race)", async () => {
    const v = await lockVersionOf(A1.id);
    const res = await withAuth(request(app).post(`/api/assessments/${A1.id}/workflow`), await login("authorA1", ROLES.AUTHOR))
      .send({ action: ACTIONS.WITHDRAW_TO_DRAFT, reason: "x", lockVersion: v - 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ASSESSMENT_STATE_CONFLICT");
    expect((await db("assessments").where({ id: A1.id }).first()).state).toBe("In Review"); // unchanged
  });

  test("Reviewer recalls review completion (Awaiting Approval→In Review) with matching lockVersion -> 200", async () => {
    await setState(A1.id, "Awaiting Approval");
    const v = await lockVersionOf(A1.id);
    const res = await withAuth(request(app).post(`/api/assessments/${A1.id}/workflow`), await login("reviewerA1", ROLES.REVIEWER))
      .send({ action: ACTIONS.RECALL_REVIEW_COMPLETION, reason: "reopening", lockVersion: v });
    expect(res.status).toBe(200);
    expect(res.body.assessment.state).toBe("In Review");
  });
});

describe("Lead Author reassignment (§5.5)", () => {
  const target = USERS.authorA1.id; // now holds Author at A2 (seeded above)

  test("current Lead Author reassigns to another Author -> 200, persisted, audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v, leadAuthorUserId: target, reason: "handover" });
    expect(res.status).toBe(200);
    expect(res.body.leadAuthorUserId).toBe(target);
    expect(res.body.lockVersion).toBe(v + 1);

    expect((await db("assessments").where({ id: A2.id }).first()).lead_author_user_id).toBe(target);
    const audit = await db("audit_log_entries").where({ action_type: "assessment.lead_author_reassigned", assessment_id: A2.id }).first();
    expect(audit.diff.leadAuthorUserId).toEqual([USERS.authorA2.id, target]);
  });

  test("an Admin can reassign -> 200", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("adminA", ROLES.ADMIN))
      .send({ lockVersion: v, leadAuthorUserId: target });
    expect(res.status).toBe(200);
  });

  test("a Reviewer cannot reassign -> 403 ROLE_NOT_ALLOWED", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("reviewerA2", ROLES.REVIEWER))
      .send({ lockVersion: v, leadAuthorUserId: target });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("target without Author rights at the facility -> 422 TARGET_NOT_AUTHOR", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v, leadAuthorUserId: USERS.reviewerA2.id }); // Reviewer, not Author
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TARGET_NOT_AUTHOR");
    expect((await db("assessments").where({ id: A2.id }).first()).lead_author_user_id).toBe(USERS.authorA2.id);
  });

  test("reassignment on an Approved assessment -> 409 INVALID_ASSESSMENT_STATE", async () => {
    await setState(A2.id, "Approved");
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v, leadAuthorUserId: target });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_ASSESSMENT_STATE");
  });

  test("stale lockVersion -> 409 LOCK_VERSION_CONFLICT", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/lead-author`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v - 1, leadAuthorUserId: target });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LOCK_VERSION_CONFLICT");
  });
});

describe("Mitigation owner assignment (§7)", () => {
  test("Author assigns an owner in Draft -> 200, persisted, audit row", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/mitigations/${CHILD.A2.mitigation}/owner`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v, ownerUserId: USERS.mitA.id, ownerRoleLabel: "Facilities Pool" });
    expect(res.status).toBe(200);
    expect(res.body.mitigation).toMatchObject({ ownerUserId: USERS.mitA.id, ownerLabel: "Facilities Pool" });

    const row = await db("mitigations").where({ id: CHILD.A2.mitigation }).first();
    expect(row.owner_user_id).toBe(USERS.mitA.id);
    expect(row.owner_role_label).toBe("Facilities Pool");
    const audit = await db("audit_log_entries").where({ action_type: "mitigation-owner-assigned", entity_id: CHILD.A2.mitigation }).first();
    expect(audit).toBeTruthy();
  });

  test("Reviewer cannot assign an owner -> 403 (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/mitigations/${CHILD.A2.mitigation}/owner`), await login("reviewerA2", ROLES.REVIEWER))
      .send({ lockVersion: v, ownerRoleLabel: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("mitigation not in this assessment -> 404 MITIGATION_NOT_FOUND", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/mitigations/${CHILD.B1.mitigation}/owner`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v, ownerRoleLabel: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("MITIGATION_NOT_FOUND");
  });

  test("stale lockVersion -> 409 (shared guard)", async () => {
    const v = await lockVersionOf(A2.id);
    const res = await withAuth(request(app).put(`/api/assessments/${A2.id}/mitigations/${CHILD.A2.mitigation}/owner`), await login("authorA2", ROLES.AUTHOR))
      .send({ lockVersion: v - 1, ownerRoleLabel: "x" });
    expect(res.status).toBe(409);
  });
});
