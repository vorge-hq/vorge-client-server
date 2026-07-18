// §Guest read-only access — G2 seed battery (G-S1…G-S3). Runs the REAL seed
// against the test Postgres and inspects the rows. Proves the guest is
// deterministic, MFA-off, single-facility, idempotent, and gated on
// SEED_GUEST_PASSWORD (unset → no guest + loud warn).
// Plan: docs/plans/guest-viewer-execution-plan.md · Spec: docs/test-specs.md §Guest.
const bcrypt = require("bcryptjs");
const db = require("../../src/db/knex");
const { seed, IDS } = require("../../src/db/seed");
const { truncateAll } = require("./fixtures");

const GUEST_USER_ID = "00000000-0000-4000-8000-000000000207";
const GUEST_ASSIGNMENT_ID = "00000000-0000-4000-8000-000000001012";
const BONNY_ID = "00000000-0000-4000-8000-000000000101";
const CORAL_ID = "00000000-0000-4000-8000-000000000102";

describe("§Guest — seed (G-S1…G-S3)", () => {
  const ORIGINAL = process.env.SEED_GUEST_PASSWORD;

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    if (ORIGINAL === undefined) {
      delete process.env.SEED_GUEST_PASSWORD;
    } else {
      process.env.SEED_GUEST_PASSWORD = ORIGINAL;
    }
    await db.destroy();
  });

  test("the deterministic ids match the plan/runbook", () => {
    // Pins seed.js's exported ids to the values the runbook documents for
    // revoke/rotate — a silent id drift would break the ops procedure.
    expect(IDS.guest).toBe(GUEST_USER_ID);
    expect(IDS.bonny).toBe(BONNY_ID);
  });

  test("G-S1 seeds a deterministic, MFA-off guest with exactly one bonny assignment", async () => {
    process.env.SEED_GUEST_PASSWORD = "guest-pass-one";
    await seed();

    const user = await db("users").where({ id: GUEST_USER_ID }).first();
    expect(user).toBeTruthy();
    expect(user.email).toBe("guest@operator-a.example");
    expect(user.name).toBe("Vorge Guest");
    expect(user.mfa_enabled).toBe(false);
    expect(user.mfa_enrolled_at).toBeNull();
    expect(user.mfa_failed_attempts).toBe(0);
    expect(await bcrypt.compare("guest-pass-one", user.password_hash)).toBe(true);

    const assignments = await db("role_assignments").where({ user_id: GUEST_USER_ID });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].id).toBe(GUEST_ASSIGNMENT_ID);
    expect(assignments[0].role).toBe("Guest");
    expect(assignments[0].facility_id).toBe(BONNY_ID);
    expect(assignments[0].cross_facility).toBe(false);
    // Single-facility scope (D4): NO coral assignment.
    const coralRows = await db("role_assignments").where({ user_id: GUEST_USER_ID, facility_id: CORAL_ID });
    expect(coralRows).toHaveLength(0);
  });

  test("G-S2 idempotent across reseeds and rotates the password", async () => {
    process.env.SEED_GUEST_PASSWORD = "first-pass";
    await seed();
    process.env.SEED_GUEST_PASSWORD = "second-pass";
    await seed();

    const users = await db("users").where({ id: GUEST_USER_ID });
    expect(users).toHaveLength(1);
    const assignments = await db("role_assignments").where({ user_id: GUEST_USER_ID });
    expect(assignments).toHaveLength(1);

    // Rotate-by-reseed: the hash now verifies the NEW password, not the old.
    expect(await bcrypt.compare("second-pass", users[0].password_hash)).toBe(true);
    expect(await bcrypt.compare("first-pass", users[0].password_hash)).toBe(false);
  });

  test("G-S3 unset password → no guest row and a loud warning", async () => {
    delete process.env.SEED_GUEST_PASSWORD;
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await seed();

    const user = await db("users").where({ id: GUEST_USER_ID }).first();
    expect(user).toBeUndefined();
    const assignments = await db("role_assignments").where({ id: GUEST_ASSIGNMENT_ID });
    expect(assignments).toHaveLength(0);
    // Assert BEFORE restoring — mockRestore() wipes the call history.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SEED_GUEST_PASSWORD"));
    warn.mockRestore();
  });
});
