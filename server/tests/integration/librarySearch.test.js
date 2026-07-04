// P4 · O3 — semantic library search integration suite (supertest + REAL Postgres
// + pgvector). Gateway mocked at the callModel seam with deterministic vectors
// (no network). Proves the §P4 semantic-search DoD: embedding written on
// create/update (async post-commit), re-embed only on text change, results
// filtered to the requester's facility (identical entry in two facilities →
// only one returns), deterministic cosine ordering, type filter, per-search
// audit row, and cross-tenant 403.
//
// AI must be ON for the search endpoint + embedding pipeline; set before app
// require and restored in afterAll so sibling suites (AI off) are unaffected.
const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
process.env.AI_ENABLED = "true";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const gateway = require("../../src/ai/gateway");
const { ROLES } = require("../../src/services/constants");
const { toVectorLiteral } = require("../../src/repositories/libraryRepository");
const { drainEmbeddings } = require("../../src/ai/libraryEmbedding");
const { FACILITIES, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

const A1 = FACILITIES.A1.id;
const B1 = FACILITIES.B1.id;
const DIMS = 1536;

// Sparse 1536-dim vector: axes not named default to 0.
function vec(pairs) {
  const v = new Array(DIMS).fill(0);
  for (const [axis, value] of Object.entries(pairs)) {
    v[Number(axis)] = value;
  }
  return v;
}

// Deterministic non-colliding vector for uncontrolled text (axes 10+ so it never
// collides with the axes 0–9 the tests pin).
function hashVec(text) {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum = (sum + text.charCodeAt(i)) % 1400;
  }
  return vec({ [10 + sum]: 1 });
}

// Exact-value → vector overrides the tests set for the phrases they care about.
const vectorFor = new Map();

async function seedEmbedded({ facilityId, type = "Scenarios", title, body, vector }) {
  const id = crypto.randomUUID();
  await db("library_entries").insert({
    id,
    facility_id: facilityId,
    type,
    title,
    body,
    metadata: JSON.stringify({}),
    embedding: db.raw("?::vector", [toVectorLiteral(vector)])
  });
  return id;
}

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
  await db("library_entries").del();
  await db("ai_call_log").del();
  vectorFor.clear();
  jest.restoreAllMocks();
  jest.spyOn(gateway, "callModel").mockImplementation(async ({ kind, value }) => {
    if (kind !== "embedding") {
      throw new Error(`unexpected gateway kind in search suite: ${kind}`);
    }
    const output = vectorFor.get(value) || hashVec(String(value));
    return {
      output,
      usage: { inputTokens: 5, outputTokens: 0 },
      reportedProvider: "openai",
      reportedModel: "openai/text-embedding-3-small"
    };
  });
});

describe("embedding pipeline (create/update)", () => {
  test("create writes an embedding post-commit, from the title+body text", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).post("/api/library"), session).send({
      facilityId: A1,
      type: "Scenarios",
      title: "Night theft",
      body: "Theft of materials from the yard at night"
    });
    expect(res.status).toBe(201);
    const id = res.body.entry.id;

    await drainEmbeddings();

    const row = await db("library_entries").where({ id }).select(db.raw("embedding IS NOT NULL AS has")).first();
    expect(row.has).toBe(true);
    expect(gateway.callModel).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "embedding", value: "Night theft\n\nTheft of materials from the yard at night" })
    );
  });

  test("update re-embeds on a body change but NOT on a metadata-only change", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const created = await withAuth(request(app).post("/api/library"), session).send({
      facilityId: A1,
      type: "Scenarios",
      title: "T",
      body: "B"
    });
    const id = created.body.entry.id;
    await drainEmbeddings();
    gateway.callModel.mockClear();

    await withAuth(request(app).put(`/api/library/${id}`), session).send({ facilityId: A1, metadata: { reviewed: true } });
    await drainEmbeddings();
    expect(gateway.callModel).not.toHaveBeenCalled();

    await withAuth(request(app).put(`/api/library/${id}`), session).send({ facilityId: A1, body: "B changed" });
    await drainEmbeddings();
    expect(gateway.callModel).toHaveBeenCalledTimes(1);
  });
});

describe("search", () => {
  test("returns only the requester's facility entries (identical entry in two facilities)", async () => {
    vectorFor.set("drone overflight", vec({ 0: 1 }));
    await seedEmbedded({ facilityId: A1, title: "Drone", body: "Unauthorized drone overflight", vector: vec({ 0: 1 }) });
    await seedEmbedded({ facilityId: B1, title: "Drone", body: "Unauthorized drone overflight", vector: vec({ 0: 1 }) });

    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(
      request(app).get(`/api/library/search?facilityId=${A1}&q=${encodeURIComponent("drone overflight")}`),
      session
    );
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].facilityId).toBe(A1);
  });

  test("orders results by cosine similarity (deterministic with mocked embeddings)", async () => {
    vectorFor.set("theft at night", vec({ 0: 0.9, 1: 0.1 }));
    const near = await seedEmbedded({ facilityId: A1, title: "Near", body: "n", vector: vec({ 0: 1 }) });
    const far = await seedEmbedded({ facilityId: A1, title: "Far", body: "f", vector: vec({ 1: 1 }) });

    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(
      request(app).get(`/api/library/search?facilityId=${A1}&q=${encodeURIComponent("theft at night")}`),
      session
    );
    expect(res.status).toBe(200);
    const ids = res.body.entries.map((e) => e.id);
    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(far));
    expect(res.body.entries[0].similarity).toBeGreaterThan(res.body.entries[1].similarity);
  });

  test("filters by library type", async () => {
    vectorFor.set("q", vec({ 0: 1 }));
    await seedEmbedded({ facilityId: A1, type: "Scenarios", title: "S", body: "s", vector: vec({ 0: 1 }) });
    await seedEmbedded({ facilityId: A1, type: "Controls", title: "C", body: "c", vector: vec({ 0: 1 }) });

    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library/search?facilityId=${A1}&q=q&type=Scenarios`), session);
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBe(1);
    expect(res.body.entries.every((e) => e.type === "Scenarios")).toBe(true);
  });

  test("a search embeds the query and writes exactly one ai_call_log row", async () => {
    vectorFor.set("q", vec({ 0: 1 }));
    await seedEmbedded({ facilityId: A1, title: "S", body: "s", vector: vec({ 0: 1 }) });
    const session = await login("adminA", ROLES.ADMIN);
    await withAuth(request(app).get(`/api/library/search?facilityId=${A1}&q=q`), session);

    const rows = await db("ai_call_log").where({ feature: "semantic_search", facility_id: A1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("success");
    expect(rows[0].user_id).toBeTruthy();
  });

  test("search outside the acting role's facility scope → 403, no query embedded", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library/search?facilityId=${B1}&q=x`), session);
    expect(res.status).toBe(403);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });

  test("missing q → 400 before any AI call", async () => {
    const session = await login("adminA", ROLES.ADMIN);
    const res = await withAuth(request(app).get(`/api/library/search?facilityId=${A1}`), session);
    expect(res.status).toBe(400);
    expect(gateway.callModel).not.toHaveBeenCalled();
  });
});
