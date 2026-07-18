// §Guest read-only access · G3 — the write-deny matrix (G-I11) + DB-unchanged
// proof (G-I12). Drives EVERY GUEST_DENY_MANIFEST entry as the fixture guest with
// a VALID payload against the REAL Postgres, and asserts the exact status+code so
// a request that merely 400s (Zod) or 404s (scope) can never masquerade as a role
// deny. Then proves nothing the guest touched actually changed.
const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ASSESSMENTS, CHILD, FACILITIES, USERS, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");
const { GUEST_DENY_MANIFEST } = require("../guestDenyManifest");

function fire(entry, session, ctx) {
  const method = entry.method.toLowerCase();
  const req = withAuth(request(app)[method](entry.url(ctx)), session);
  return req.send(entry.body(ctx));
}

describe("§Guest — write-deny matrix (G-I11) + unchanged proof (G-I12)", () => {
  let guest;
  let ctx;
  let assetNameBefore;
  let lockVersionBefore;

  beforeAll(async () => {
    await truncateAll(db);
    await seedFixtures(db);
    guest = await login("guestA1", "Guest");
    ctx = {
      assessment: ASSESSMENTS.A1.id, // IN_REVIEW, in the guest's facility scope
      asset: CHILD.A1.asset,
      threat: CHILD.A1.threat,
      evaluation: CHILD.A1.evaluation,
      mitigation: CHILD.A1.mitigation,
      facilityId: FACILITIES.A1.id,
      leadAuthorUserId: USERS.authorA1.id,
      anyUuid: "00000000-0000-4000-8000-0000000099ff"
    };
    const asset = await db("assets").where({ id: ctx.asset }).first();
    assetNameBefore = asset.name;
    const assessment = await db("assessments").where({ id: ctx.assessment }).first();
    lockVersionBefore = assessment.lock_version;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each(GUEST_DENY_MANIFEST.map((e) => [`${e.method} ${e.path}`, e]))(
    "G-I11 %s → guest denied with the exact status+code",
    async (_label, entry) => {
      const res = await fire(entry, guest, ctx);
      expect({ status: res.status, code: res.body?.error?.code }).toEqual({
        status: entry.expect.status,
        code: entry.expect.code
      });
    }
  );

  test("G-I12 nothing the guest touched actually changed", async () => {
    // Representative content family: the asset the guest tried to PATCH/DELETE.
    const asset = await db("assets").where({ id: ctx.asset }).first();
    expect(asset).toBeTruthy();
    expect(asset.name).toBe(assetNameBefore);

    // No content mutation ⇒ no lock_version bump on the target assessment.
    const assessment = await db("assessments").where({ id: ctx.assessment }).first();
    expect(assessment.lock_version).toBe(lockVersionBefore);

    // The library create attempt persisted nothing for the guest's facility.
    const guestLibrary = await db("library_entries").where({ facility_id: ctx.facilityId, title: "Guest entry" });
    expect(guestLibrary).toHaveLength(0);

    // The mitigation-log attempt (404) wrote no progress row.
    const logs = await db("mitigation_progress_logs").where({ mitigation_id: ctx.mitigation });
    expect(logs).toHaveLength(0);
  });
});
