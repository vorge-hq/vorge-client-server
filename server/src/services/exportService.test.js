// P3.5 · unit coverage for the pure document renderers. exportService takes a
// read bundle + assembled front-matter and returns a .docx/.pdf Buffer with no
// DB or network, so it is fully unit-testable. The behavioural end-to-end proof
// (real Postgres, audit, role matrix, frozen snapshot) lives in
// tests/integration/export.test.js; this file drives the rendering branches.
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { buildAssessmentDocx, buildAssessmentPdf, deriveTables, FORMATS } = require("./exportService");

// A "full" bundle exercising every populated section + a named contributor.
function fullBundle() {
  return {
    assessment: {
      id: "a1",
      name: "Facility A1 — 2026 SRA",
      facilityName: "Facility A1",
      operatorName: "Operator A",
      state: "Draft",
      leadAuthorUserId: "u1",
      contributors: [{ name: "Dana Contributor", role: "Consultant", organization: "SecureCo" }]
    },
    // Top-level contributors (truthy) override assessment.contributors and cover
    // every name/meta fallback shape: name, fullName, email, organisation, company,
    // and a bare name with no role/org.
    contributors: [
      { name: "Dana Contributor", role: "Consultant", organization: "SecureCo" },
      { fullName: "Fabian Fullname" },
      { email: "ellis@x.com" },
      { name: "Nora", organisation: "OrgAlt" },
      { name: "Cody", company: "CompanyCo" },
      { name: "Solo" }
    ],
    assets: [{ id: "as1", name: "Control Room", assetType: "Control Room", criticality: "High" }],
    threats: [{ id: "th1", name: "Cyber", likelihood: 3 }],
    links: [
      { id: "l1", assetId: "as1", threatId: "th1", enabled: true },
      { id: "l2", assetId: "missing", threatId: "missing", enabled: false } // filtered out
    ],
    evaluations: [
      { id: "e1", assetId: "as1", threatId: "th1", scenario: "s", controls: "c", vulnerabilities: "v", r1: { band: "High" }, r2: { band: "Medium" } },
      { id: "e2", assetId: "gone", threatId: "gone", scenario: "s2", controls: "c2", vulnerabilities: "v2", r1: null, r2: undefined } // fallback branches
    ],
    mitigations: [{ id: "m1", description: "do the thing", severity: "High", ownerLabel: "Owner", agreed: "Yes", targetDate: "2026-12-31", status: "Open" }],
    sectionTexts: { 1: "Exec summary text", 8: "Conclusion text" }
  };
}

// An "empty" bundle: no children, string-shaped contributor, forces the
// "No entries recorded." table branch and the non-object contributor branch.
function emptyBundle() {
  return {
    assessment: { id: "a2", name: "Empty SRA", facilityName: "Facility B", operatorName: "Operator B", state: "Approved", leadAuthorUserId: null, contributors: ["Just A Name"] },
    assets: [],
    threats: [],
    links: [],
    evaluations: [],
    mitigations: [],
    sectionTexts: {}
  };
}

const nonFinalFront = {
  approvals: [
    { role: "Author", name: "Alice Author", position: "Lead", signedAt: "2026-07-01T00:00:00.000Z" },
    { role: "Reviewer", name: null, position: null, signedAt: null },
    { role: "Approver", name: null, position: null, signedAt: null }
  ],
  versions: [{ versionTag: "Rev 1", author: "Alice Author", approver: "Al Approver", approvedAt: new Date("2026-07-02T00:00:00.000Z"), comments: null }],
  isFinal: false,
  watermarkText: "DRAFT — NOT A FINAL APPROVED COPY",
  approvalDate: null
};

const finalFront = {
  approvals: [
    { role: "Author", name: "Bob Author", position: null, signedAt: null },
    { role: "Reviewer", name: "Rita Reviewer", position: null, signedAt: "not-a-date" }, // invalid date → DASH
    { role: "Approver", name: "Al Approver", position: null, signedAt: "2026-07-02T00:00:00.000Z" }
  ],
  versions: [],
  isFinal: true,
  watermarkText: null,
  approvalDate: "2026-07-02T00:00:00.000Z"
};

describe("deriveTables", () => {
  test("keeps only enabled links and falls back to a dash for missing asset/threat names", () => {
    const t = deriveTables(fullBundle());
    expect(t.matrixRows).toHaveLength(1); // disabled link dropped
    expect(t.matrixRows[0]).toEqual(["Control Room", "Cyber"]);
    // Evaluation with a missing asset/threat id and null/undefined r1/r2 → dashes.
    expect(t.evaluationRows[1]).toEqual(["—", "—", "s2", "v2", "c2", "—", "—"]);
    expect(t.mitigationRows[0]).toEqual(["do the thing", "High", "Owner", "Yes", "2026-12-31", "Open"]);
  });

  test("tolerates a bundle with no child arrays", () => {
    const t = deriveTables({ assessment: {} });
    expect(t.assetRows).toEqual([]);
    expect(t.matrixRows).toEqual([]);
    expect(t.evaluationRows).toEqual([]);
  });

  test("renders empty-string fields as a dash (text() empty branch)", () => {
    const t = deriveTables({ assessment: {}, assets: [{ id: "x", name: "", assetType: "", criticality: "" }] });
    expect(t.assetRows[0]).toEqual(["—", "—", "—"]);
  });
});

describe("buildAssessmentDocx", () => {
  test("renders ordered headings, populated tables, watermark, and front-matter", async () => {
    const buffer = await buildAssessmentDocx({ bundle: fullBundle(), frontMatter: nonFinalFront });
    const { value } = await mammoth.extractRawText({ buffer });

    const headings = ["Executive Summary", "Facility Information", "Asset Disaggregation", "Threat Assessment", "Asset Attractiveness Cross-Reference", "Vulnerability Assessment & Risk Treatment", "Proposed Mitigation", "Conclusion", "Appendices"];
    let cursor = -1;
    for (const h of headings) {
      const at = value.indexOf(h);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(value).toContain("DRAFT — NOT A FINAL APPROVED COPY"); // watermark branch
    expect(value).toContain("Facility A1 — 2026 SRA");
    expect(value).toContain("Alice Author"); // approvals table
    expect(value).toContain("Rev 1"); // version control table
    expect(value).toContain("Dana Contributor"); // contributors appendix
    expect(value).toContain("Exec summary text"); // section text branch
    expect(value).toContain("do the thing"); // mitigation row
  });

  test("clean (no watermark) with empty tables and a string contributor", async () => {
    const buffer = await buildAssessmentDocx({ bundle: emptyBundle(), frontMatter: finalFront });
    const { value } = await mammoth.extractRawText({ buffer });
    expect(value).not.toContain("NOT A FINAL");
    expect(value).toContain("No entries recorded."); // empty-table branch
    expect(value).toContain("Just A Name"); // non-object contributor branch
  });
});

describe("buildAssessmentPdf", () => {
  test("produces a parseable PDF with the assessment text", async () => {
    const buffer = await buildAssessmentPdf({ bundle: fullBundle(), frontMatter: nonFinalFront });
    expect(buffer.slice(0, 5).toString()).toBe("%PDF-");
    const parsed = await pdfParse(buffer);
    expect(parsed.numpages).toBeGreaterThan(0);
    expect(parsed.text).toContain("Facility A1");
  });

  test("renders the clean/empty variant without throwing", async () => {
    const buffer = await buildAssessmentPdf({ bundle: emptyBundle(), frontMatter: finalFront });
    expect(buffer.slice(0, 5).toString()).toBe("%PDF-");
  });

  test("rejects when the input shape is unusable", async () => {
    await expect(buildAssessmentPdf({ bundle: null, frontMatter: nonFinalFront })).rejects.toBeDefined();
  });
});

describe("FORMATS registry", () => {
  test("exposes docx + pdf with content types and extensions", () => {
    expect(FORMATS.docx.contentType).toContain("wordprocessingml");
    expect(FORMATS.docx.extension).toBe("docx");
    expect(FORMATS.pdf.contentType).toBe("application/pdf");
    expect(FORMATS.pdf.extension).toBe("pdf");
    expect(typeof FORMATS.docx.build).toBe("function");
    expect(typeof FORMATS.pdf.build).toBe("function");
  });
});
