// P4 · O1 — Library management CRUD integration suite (supertest + REAL Postgres
// via the P2 harness). Proves: the full CRUD lifecycle with audit rows, the
// Admin-only write / any-role read matrix, cross-tenant isolation (requested
// facility outside scope → 403; another facility's id → 404, no leak), and
// request validation. Cross-tenant RLS at the DB layer has its own suites
// (rls.test.js); this proves the library module's app-layer guards.
const request = require("supertest");
const crypto = require("crypto");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES } = require("../../src/services/constants");
const { FACILITIES, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A1 = FACILITIES.A1.id; // Operator A facility — adminA (cross-facility) can write here.
const B1 = FACILITIES.B1.id; // Operator B facility — outside adminA's scope.

async function seedEntry({ facilityId, type = "Scenarios", title = "Seeded", body = "Seeded body" }) {
  const id = crypto.randomUUID();
  await db("library_entries").insert({ id, facility_id: facilityId, type, title, body, metadata: JSON.stringify({}) });
  return id;
}

beforeAll(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("Library CRUD lifecycle (Admin) + audit rows", () => {
  let createdId;

  test("POST /api/library — Admin creates an entry -> 201, persisted, audit library-entry-created", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).post("/api/library"), session)
      .set("X-Trace-Id", "trace-lib-create")
      .send({ facilityId: A1, type: "Scenarios", title: "Vessel approach", body: "Unauthorised vessel approaches the berth." });

    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ facilityId: A1, type: "Scenarios", title: "Vessel approach" });
    createdId = res.body.entry.id;

    const persisted = await db("library_entries").where({ id: createdId }).first();
    expect(persisted).toBeTruthy();
    expect(persisted.facility_id).toBe(A1);

    const audit = await db("audit_log_entries").where({ entity_id: createdId, action_type: "library-entry-created" });
    expect(audit).toHaveLength(1);
    expect(audit[0].facility_id).toBe(A1);
    expect(audit[0].entity_type).toBe("library_entry");
    expect(audit[0].trace_id).toBe("trace-lib-create");
    expect(audit[0].diff.title).toEqual([null, "Vessel approach"]);
  });

  test("GET /api/library — lists the facility's entries", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library?facilityId=${A1}`), session);
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e) => e.id === createdId)).toBe(true);
  });

  test("GET /api/library?type= — filters by library type", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const match = await withAuth(request(app).get(`/api/library?facilityId=${A1}&type=Scenarios`), session);
    expect(match.body.entries.some((e) => e.id === createdId)).toBe(true);
    const other = await withAuth(request(app).get(`/api/library?facilityId=${A1}&type=Controls`), session);
    expect(other.body.entries.some((e) => e.id === createdId)).toBe(false);
  });

  test("GET /api/library/:id — returns the single entry", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library/${createdId}?facilityId=${A1}`), session);
    expect(res.status).toBe(200);
    expect(res.body.entry.id).toBe(createdId);
  });

  test("PUT /api/library/:id — Admin updates -> 200, diff of changed fields, audit library-entry-updated", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).put(`/api/library/${createdId}`), session)
      .send({ facilityId: A1, title: "Vessel approach (revised)" });

    expect(res.status).toBe(200);
    expect(res.body.entry.title).toBe("Vessel approach (revised)");

    const audit = await db("audit_log_entries").where({ entity_id: createdId, action_type: "library-entry-updated" });
    expect(audit).toHaveLength(1);
    expect(audit[0].diff.title).toEqual(["Vessel approach", "Vessel approach (revised)"]);
    expect(audit[0].diff.body).toBeUndefined();
  });

  test("DELETE /api/library/:id — Admin deletes -> 200, row gone, audit library-entry-deleted", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).delete(`/api/library/${createdId}`), session).send({ facilityId: A1 });

    expect(res.status).toBe(200);
    expect(res.body.entry).toEqual({ id: createdId, deleted: true });

    const persisted = await db("library_entries").where({ id: createdId }).first();
    expect(persisted).toBeUndefined();

    const audit = await db("audit_log_entries").where({ entity_id: createdId, action_type: "library-entry-deleted" });
    expect(audit).toHaveLength(1);
  });
});

describe("Write/read role matrix", () => {
  // Writes are Admin-only; reads are open to any facility role.
  const nonAdminWriters = [
    ["authorA1", ROLES.AUTHOR],
    ["reviewerA1", ROLES.REVIEWER],
    ["approverA", ROLES.APPROVER],
    ["hqA", ROLES.HQ_EXECUTIVE],
    ["mitA", ROLES.MITIGATION_OWNER]
  ];

  test.each(nonAdminWriters)("POST as %s(%s) -> 403 ROLE_NOT_ALLOWED", async (userKey, role) => {
    const session = await login(userKey, role);
    const res = await withAuth(request(app).post("/api/library"), session)
      .send({ facilityId: A1, type: "Scenarios", title: "x", body: "y" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("GET as Author (non-Admin facility role) -> 200 (reads are open)", async () => {
    const session = await login("authorA1", ROLES.AUTHOR);
    const res = await withAuth(request(app).get(`/api/library?facilityId=${A1}`), session);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  test("GET as operator-only HQ Executive (no direct facility row) -> 200", async () => {
    // hqOpOnlyA covers facility A1 only via operator scope. The route resolves
    // A1's operator so canAccessFacility's HQ branch matches — without that
    // resolution this read would wrongly 403.
    const entryId = await seedEntry({ facilityId: A1, title: "Op-scope readable" });
    const session = await login("hqOpOnlyA", ROLES.HQ_EXECUTIVE);
    const res = await withAuth(request(app).get(`/api/library?facilityId=${A1}`), session);
    expect(res.status).toBe(200);
    expect(res.body.entries.some((e) => e.id === entryId)).toBe(true);
  });

  test("Unauthenticated -> 401", async () => {
    const res = await request(app).get(`/api/library?facilityId=${A1}`);
    expect(res.status).toBe(401);
  });
});

describe("Cross-tenant isolation", () => {
  test("Admin writing to a facility outside scope -> 403 FACILITY_ACCESS_DENIED", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).post("/api/library"), session)
      .send({ facilityId: B1, type: "Scenarios", title: "x", body: "y" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FACILITY_ACCESS_DENIED");
  });

  test("Admin listing a facility outside scope -> 403 (no cross-tenant data)", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library?facilityId=${B1}`), session);
    expect(res.status).toBe(403);
    expect(res.body.entries).toBeUndefined();
  });

  test("An in-scope facilityId but another facility's entry id -> 404 (no leak)", async () => {
    const foreignId = await seedEntry({ facilityId: B1 });
    const session = await login("adminA", ROLES.ADMIN);
    // facilityId A1 is in scope (guard passes) but the entry lives in B1 → the
    // facility-filtered repo read finds nothing → 404, never B1's row.
    const res = await withAuth(request(app).get(`/api/library/${foreignId}?facilityId=${A1}`), session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("LIBRARY_ENTRY_NOT_FOUND");
  });
});

describe("Request validation", () => {
  test("POST without facilityId -> 400 VALIDATION_ERROR", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).post("/api/library"), session)
      .send({ type: "Scenarios", title: "x", body: "y" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  test("POST with an out-of-vocabulary type -> 400 VALIDATION_ERROR", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).post("/api/library"), session)
      .send({ facilityId: A1, type: "NotAType", title: "x", body: "y" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// O3 — with AI disabled (the default in this suite), semantic search returns a
// clean 404 rather than attempting an embedding call. (The enabled-path behavior
// has its own suite: librarySearch.test.js.)
describe("Semantic search — AI disabled", () => {
  test("GET /api/library/search -> 404 AI_FEATURE_DISABLED", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library/search?facilityId=${A1}&q=theft`), session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("AI_FEATURE_DISABLED");
  });
});
