// P3.5 · Document export (test-specs §P3.5). Runs against REAL Postgres via the
// P2 harness so RLS/facility scope and the atomic audit write are exercised for
// real, not mocked. Covers: golden-content .docx, PDF smoke, the §16 role
// matrix + export audit row, the Approved frozen-snapshot rule, and the <30s
// perf guard.
const crypto = require("crypto");
const request = require("supertest");
const mammoth = require("mammoth");
const { execFileSync } = require("child_process");
const app = require("../../src/app");
const db = require("../../src/db/knex");
const { ROLES, ASSESSMENT_STATES } = require("../../src/services/constants");
const { ASSESSMENTS, CHILD, FACILITIES, USERS, truncateAll, seedFixtures } = require("./fixtures");
const { login, withAuth } = require("./session");

// Parse a PDF buffer in a FRESH node process. pdf-parse@1.x's bundled pdf.js
// throws UnknownErrorException during its webpack module-eval when the jest VM's
// heap is in certain states — any moderately-sized change to src/app's module
// graph (e.g. mounting a new router) can trip it, even though the produced PDF
// is byte-valid (the %PDF- magic check below always passes). Evaluating pdf.js
// in a pristine registry per call makes the smoke check robust to jest heap
// layout WITHOUT weakening the assertion (page count + extractable text still
// verified on the real exported bytes).
function parsePdfClean(buffer) {
  const out = execFileSync(
    process.execPath,
    [
      "-e",
      "const p=require('pdf-parse');const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>p(Buffer.concat(c)).then(r=>process.stdout.write(JSON.stringify({numpages:r.numpages,text:r.text}))).catch(e=>{console.error(e);process.exit(1)}));"
    ],
    { input: buffer, maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.toString());
}

const A2 = ASSESSMENTS.A2; // Draft, authored by authorA2 — the editable fixture
const SECTION_HEADINGS = [
  "Executive Summary",
  "Facility Information",
  "Asset Disaggregation",
  "Threat Assessment",
  "Asset Attractiveness Cross-Reference",
  "Vulnerability Assessment & Risk Treatment",
  "Proposed Mitigation",
  "Conclusion",
  "Appendices"
];

function exportReq(assessmentId, format, session, overrideRole) {
  const req = request(app).get(`/api/assessments/${assessmentId}/export`).query(format ? { format } : {});
  return withAuth(req, session, overrideRole);
}

async function seedSignOff({ actionType, userId, assessmentId, facilityId }) {
  await db("audit_log_entries").insert({
    id: crypto.randomUUID(),
    facility_id: facilityId,
    assessment_id: assessmentId,
    user_id: userId,
    acting_role: ROLES.REVIEWER,
    action_type: actionType,
    entity_type: "assessment",
    entity_id: assessmentId,
    diff: JSON.stringify({}),
    metadata: JSON.stringify({}),
    trace_id: "seed",
    hash: crypto.randomUUID()
  });
}

beforeEach(async () => {
  await truncateAll(db);
  await seedFixtures(db);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await db.destroy();
});

describe("golden-content .docx", () => {
  test("renders ordered section headings, front-matter names, mitigations, and the assessment/facility", async () => {
    // Named contributor + a reviewer sign-off so both front-matter tables carry
    // real seeded names (not just the Lead Author).
    await db("assessments").where({ id: A2.id }).update({
      contributors: JSON.stringify([{ name: "Dana Contributor", role: "Consultant", organization: "SecureCo" }])
    });
    await seedSignOff({
      actionType: "assessment.review_completed",
      userId: USERS.reviewerA2.id,
      assessmentId: A2.id,
      facilityId: FACILITIES.A2.id
    });

    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "docx", session).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("wordprocessingml.document");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename=".+\.docx"/);

    const { value: docText } = await mammoth.extractRawText({ buffer: res.body });

    // All 9 section headings present AND in order (§16.3).
    let cursor = -1;
    for (const heading of SECTION_HEADINGS) {
      const at = docText.indexOf(heading);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    // Cover: assessment name + facility.
    expect(docText).toContain("Facility A2");
    expect(docText).toContain(A2.name);

    // Document Approvals: Author (lead author) + Reviewer sign-off names.
    expect(docText).toContain(USERS.authorA2.email); // fixture user names = emails
    expect(docText).toContain(USERS.reviewerA2.email);

    // Contributors appendix.
    expect(docText).toContain("Dana Contributor");

    // Every seeded mitigation row appears (§16.3, Section 7).
    expect(docText).toContain("do the thing");
  });
});

describe("PDF smoke", () => {
  test("returns a real PDF: %PDF magic, page count > 0, extractable text has the assessment", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "pdf", session).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");

    const parsed = parsePdfClean(res.body);
    expect(parsed.numpages).toBeGreaterThan(0);
    expect(parsed.text).toContain("Facility A2");
  });
});

describe("permissions (§16 export role matrix)", () => {
  test.each([
    ["authorA2", ROLES.AUTHOR],
    ["reviewerA2", ROLES.REVIEWER],
    ["hqA", ROLES.HQ_EXECUTIVE],
    ["adminA", ROLES.ADMIN]
  ])("%s (%s) may export → 200", async (userKey, role) => {
    const session = await login(userKey, role);
    const res = await exportReq(A2.id, "docx", session);
    expect(res.status).toBe(200);
  });

  test("Mitigation Owner cannot export → 403 ROLE_NOT_ALLOWED", async () => {
    // mitA holds Mitigation Owner on A1 (In Review) — reachable, but no section
    // access, so the role gate rejects it.
    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await exportReq(ASSESSMENTS.A1.id, "docx", session);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("cross-tenant export → 404 (no existence leak)", async () => {
    const session = await login("authorB2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "docx", session);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ASSESSMENT_NOT_FOUND");
  });

  test("unauthenticated export → 401", async () => {
    const res = await exportReq(A2.id, "docx", null);
    expect(res.status).toBe(401);
  });

  test("unsupported format → 400", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "xlsx", session);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_EXPORT_FORMAT");
  });
});

describe("export audit trail", () => {
  async function exportAuditRows(assessmentId) {
    return db("audit_log_entries").where({ assessment_id: assessmentId, action_type: "export" });
  }

  test("a successful export writes exactly ONE `export` audit row echoing the trace id", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "docx", session).set("X-Trace-Id", "trace-export-1");
    expect(res.status).toBe(200);

    const rows = await exportAuditRows(A2.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action_type: "export",
      entity_type: "assessment",
      entity_id: A2.id,
      facility_id: FACILITIES.A2.id,
      trace_id: "trace-export-1"
    });
    expect(rows[0].metadata.format).toBe("docx");
  });

  test("a rejected export (403) writes NO export audit row", async () => {
    const session = await login("mitA", ROLES.MITIGATION_OWNER);
    const res = await exportReq(ASSESSMENTS.A1.id, "docx", session);
    expect(res.status).toBe(403);
    expect(await exportAuditRows(ASSESSMENTS.A1.id)).toHaveLength(0);
  });
});

describe("watermark + frozen snapshot (§16.2)", () => {
  test("a non-final (Draft) export carries the non-final watermark", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const res = await exportReq(A2.id, "docx", session).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    const { value } = await mammoth.extractRawText({ buffer: res.body });
    expect(value).toContain("NOT A FINAL");
  });

  test("an Approved export renders the FROZEN snapshot and is clean (no watermark)", async () => {
    // Freeze a snapshot with a distinctive name/asset, then diverge the live row.
    const frozenBundle = {
      assessment: {
        id: A2.id,
        name: "FROZEN SNAPSHOT NAME",
        facilityName: FACILITIES.A2.name,
        operatorName: "Operator A",
        state: ASSESSMENT_STATES.APPROVED,
        leadAuthorUserId: USERS.authorA2.id,
        contributors: []
      },
      assets: [{ id: CHILD.A2.asset, name: "FROZEN ASSET NAME", assetType: "Control Room", criticality: "High" }],
      threats: [],
      links: [],
      evaluations: [],
      mitigations: [],
      sectionTexts: {}
    };
    await db("versions").insert({
      id: crypto.randomUUID(),
      facility_id: FACILITIES.A2.id,
      assessment_id: A2.id,
      version_number: 1,
      assessment_snapshot: JSON.stringify(frozenBundle),
      configuration_snapshot: JSON.stringify({}),
      approved_at: db.fn.now()
    });
    // Live divergence: approve the assessment and rename its live content.
    await db("assessments").where({ id: A2.id }).update({ state: ASSESSMENT_STATES.APPROVED, name: "LIVE MODIFIED NAME" });
    await db("assets").where({ id: CHILD.A2.asset }).update({ name: "LIVE MODIFIED ASSET" });

    const session = await login("adminA", ROLES.ADMIN); // Author gate is Draft-only; use a reader role
    const res = await exportReq(A2.id, "docx", session).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);

    const { value } = await mammoth.extractRawText({ buffer: res.body });
    expect(value).toContain("FROZEN SNAPSHOT NAME");
    expect(value).toContain("FROZEN ASSET NAME");
    expect(value).not.toContain("LIVE MODIFIED NAME");
    expect(value).not.toContain("LIVE MODIFIED ASSET");
    expect(value).not.toContain("NOT A FINAL"); // Approved exports are clean
  });
});

describe("performance (§18.6 <30s guard)", () => {
  test("the seeded assessment exports well under 30s", async () => {
    const session = await login("authorA2", ROLES.AUTHOR);
    const start = Date.now();
    const res = await exportReq(A2.id, "docx", session);
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(30000);
  });
});
