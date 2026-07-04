// P3.5 · Document export — renders an assessment bundle to the standard SRA
// template in Word (.docx) and PDF. Both formats render from the SAME normalized
// inputs (the read bundle + a `frontMatter` object the route assembles from the
// audit log / version history), so the two outputs stay in lock-step.
//
// Word uses the `docx` library (§16.1 primary format). PDF uses `pdfkit` — a
// pure-JS generator, no headless browser, so it is fast (well under the §18.6
// 30s target) and deterministic in CI. Custom corporate templates are a Phase 3
// add-on (§16.5); v1 renders the standard SRA template only.
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle
} = require("docx");
const PDFDocument = require("pdfkit");
const { SECTION_NAMES } = require("../repositories/assessmentRepository");

const DASH = "—";

function text(value) {
  if (value === null || value === undefined || value === "") {
    return DASH;
  }
  return String(value);
}

function formatDate(value) {
  if (!value) {
    return DASH;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return DASH;
  }
  // Deterministic ISO date (no locale/timezone drift in CI or exported docs).
  return d.toISOString().slice(0, 10);
}

// Contributors are free-form JSON records; pull the common display fields and
// fall back gracefully so an operator's odd shape still renders a name.
function contributorName(c) {
  if (!c || typeof c !== "object") {
    return text(c);
  }
  return text(c.name || c.fullName || c.email);
}
function contributorMeta(c) {
  if (!c || typeof c !== "object") {
    return "";
  }
  return [c.role, c.organization || c.organisation || c.company].filter(Boolean).join(", ");
}

function byId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    map.set(row.id, row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Shared row derivation — the single source of truth for what each section
// table contains, consumed by BOTH renderers so docx and pdf never drift.
// ---------------------------------------------------------------------------
function deriveTables(bundle) {
  const assets = bundle.assets || [];
  const threats = bundle.threats || [];
  const assetById = byId(assets);
  const threatById = byId(threats);

  const assetRows = assets.map((a) => [text(a.name), text(a.assetType), text(a.criticality)]);
  const threatRows = threats.map((t) => [text(t.name), text(t.likelihood)]);

  // Section 5 — the asset×threat cross-reference: enabled pairs only (§16.3).
  const matrixRows = (bundle.links || [])
    .filter((l) => l.enabled)
    .map((l) => [
      text(assetById.get(l.assetId)?.name),
      text(threatById.get(l.threatId)?.name)
    ]);

  // Section 6 — vulnerability assessment & risk treatment.
  const evaluationRows = (bundle.evaluations || []).map((e) => [
    text(assetById.get(e.assetId)?.name),
    text(threatById.get(e.threatId)?.name),
    text(e.scenario),
    text(e.vulnerabilities),
    text(e.controls),
    text(e.r1?.band),
    text(e.r2?.band)
  ]);

  // Section 7 — proposed mitigation (every mitigation row must appear).
  const mitigationRows = (bundle.mitigations || []).map((m) => [
    text(m.description),
    text(m.severity),
    text(m.ownerLabel),
    text(m.agreed),
    formatDate(m.targetDate),
    text(m.status)
  ]);

  return { assetRows, threatRows, matrixRows, evaluationRows, mitigationRows };
}

// ===========================================================================
// Word (.docx)
// ===========================================================================
function heading(str, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text: str, heading: level });
}

function para(str) {
  return new Paragraph({ children: [new TextRun(text(str))] });
}

function labelValue(label, value) {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(text(value))]
  });
}

function docxTable(headerCells, rows) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const makeCell = (value, bold) =>
    new TableCell({
      borders,
      children: [new Paragraph({ children: [new TextRun({ text: text(value), bold: !!bold })] })]
    });

  const header = new TableRow({
    tableHeader: true,
    children: headerCells.map((c) => makeCell(c, true))
  });
  const body = rows.length
    ? rows.map((r) => new TableRow({ children: r.map((c) => makeCell(c, false)) }))
    : [new TableRow({ children: [makeCell(`No entries recorded.`, false), ...headerCells.slice(1).map(() => makeCell("", false))] })];

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] });
}

async function buildAssessmentDocx({ bundle, frontMatter }) {
  const { assessment } = bundle;
  const { approvals, versions, watermarkText } = frontMatter;
  const t = deriveTables(bundle);
  const children = [];

  // --- Cover page (§16.3) --------------------------------------------------
  if (watermarkText) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: watermarkText, bold: true, color: "B00020", size: 32 })]
      })
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "Security Risk Assessment", bold: true })]
    })
  );
  children.push(labelValue("Assessment", assessment.name));
  children.push(labelValue("Facility", assessment.facilityName));
  children.push(labelValue("Operator", assessment.operatorName));
  children.push(labelValue("Status", assessment.state));
  children.push(labelValue("Approval date", formatDate(frontMatter.approvalDate)));

  // --- Front-matter tables (§16.4) ----------------------------------------
  children.push(heading("Document Approvals"));
  children.push(
    docxTable(
      ["Role", "Name", "Position", "Signature & date"],
      approvals.map((a) => [a.role, text(a.name), text(a.position), a.signedAt ? formatDate(a.signedAt) : DASH])
    )
  );

  children.push(heading("Version Control"));
  children.push(
    docxTable(
      ["Version", "Author", "Approver", "Approval date", "Comments"],
      versions.map((v) => [text(v.versionTag), text(v.author), text(v.approver), formatDate(v.approvedAt), text(v.comments)])
    )
  );

  // --- Sections 1–8 (§16.3) — headings ALWAYS present and ordered ----------
  const sectionTexts = bundle.sectionTexts || {};
  SECTION_NAMES.forEach((name, index) => {
    const n = index + 1;
    children.push(heading(`Section ${n}. ${name}`));

    if (sectionTexts[n]) {
      children.push(para(sectionTexts[n]));
    }
    if (n === 3) {
      children.push(docxTable(["Asset", "Type", "Criticality"], t.assetRows));
    } else if (n === 4) {
      children.push(docxTable(["Threat", "Likelihood"], t.threatRows));
    } else if (n === 5) {
      children.push(docxTable(["Asset", "Threat"], t.matrixRows));
    } else if (n === 6) {
      children.push(
        docxTable(["Asset", "Threat", "Scenario", "Vulnerabilities", "Controls", "Initial risk", "Residual risk"], t.evaluationRows)
      );
    } else if (n === 7) {
      children.push(docxTable(["Mitigation", "Severity", "Owner", "Agreed", "Target date", "Status"], t.mitigationRows));
    } else if (n === 9) {
      // Appendices: SRA Team Members (contributors) + Risk Assessment Matrix note.
      children.push(new Paragraph({ text: "SRA Team Members", heading: HeadingLevel.HEADING_2 }));
      children.push(
        docxTable(
          ["Name", "Role / Organisation"],
          (bundle.contributors || assessment.contributors || []).map((c) => [contributorName(c), contributorMeta(c)])
        )
      );
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ===========================================================================
// PDF (pdfkit)
// ===========================================================================
function pdfTable(doc, headerCells, rows) {
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(headerCells.join("  |  "));
  doc.font("Helvetica").fontSize(9);
  if (!rows.length) {
    doc.text("No entries recorded.");
  }
  for (const r of rows) {
    doc.text(r.map((c) => text(c)).join("  |  "));
  }
  doc.moveDown(0.5);
}

function buildAssessmentPdf({ bundle, frontMatter }) {
  return new Promise((resolve, reject) => {
    try {
      const { assessment } = bundle;
      const { approvals, versions, watermarkText } = frontMatter;
      const t = deriveTables(bundle);
      const doc = new PDFDocument({ margin: 50, autoFirstPage: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      if (watermarkText) {
        doc.font("Helvetica-Bold").fontSize(16).fillColor("#B00020").text(watermarkText, { align: "center" });
        doc.fillColor("black");
      }
      doc.font("Helvetica-Bold").fontSize(20).text("Security Risk Assessment", { align: "center" });
      doc.moveDown();
      doc.font("Helvetica").fontSize(11);
      doc.text(`Assessment: ${text(assessment.name)}`);
      doc.text(`Facility: ${text(assessment.facilityName)}`);
      doc.text(`Operator: ${text(assessment.operatorName)}`);
      doc.text(`Status: ${text(assessment.state)}`);
      doc.text(`Approval date: ${formatDate(frontMatter.approvalDate)}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").fontSize(13).text("Document Approvals");
      pdfTable(
        doc,
        ["Role", "Name", "Position", "Signature & date"],
        approvals.map((a) => [a.role, text(a.name), text(a.position), a.signedAt ? formatDate(a.signedAt) : DASH])
      );

      doc.font("Helvetica-Bold").fontSize(13).text("Version Control");
      pdfTable(
        doc,
        ["Version", "Author", "Approver", "Approval date", "Comments"],
        versions.map((v) => [text(v.versionTag), text(v.author), text(v.approver), formatDate(v.approvedAt), text(v.comments)])
      );

      const sectionTexts = bundle.sectionTexts || {};
      SECTION_NAMES.forEach((name, index) => {
        const n = index + 1;
        doc.moveDown(0.5);
        doc.font("Helvetica-Bold").fontSize(13).text(`Section ${n}. ${name}`);
        doc.font("Helvetica").fontSize(10);
        if (sectionTexts[n]) {
          doc.text(text(sectionTexts[n]));
        }
        if (n === 3) {
          pdfTable(doc, ["Asset", "Type", "Criticality"], t.assetRows);
        } else if (n === 4) {
          pdfTable(doc, ["Threat", "Likelihood"], t.threatRows);
        } else if (n === 5) {
          pdfTable(doc, ["Asset", "Threat"], t.matrixRows);
        } else if (n === 6) {
          pdfTable(doc, ["Asset", "Threat", "Scenario", "Vulnerabilities", "Controls", "Initial", "Residual"], t.evaluationRows);
        } else if (n === 7) {
          pdfTable(doc, ["Mitigation", "Severity", "Owner", "Agreed", "Target date", "Status"], t.mitigationRows);
        } else if (n === 9) {
          doc.font("Helvetica-Bold").fontSize(11).text("SRA Team Members");
          pdfTable(
            doc,
            ["Name", "Role / Organisation"],
            (bundle.contributors || assessment.contributors || []).map((c) => [contributorName(c), contributorMeta(c)])
          );
        }
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

const FORMATS = {
  docx: {
    build: buildAssessmentDocx,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx"
  },
  pdf: {
    build: buildAssessmentPdf,
    contentType: "application/pdf",
    extension: "pdf"
  }
};

module.exports = {
  buildAssessmentDocx,
  buildAssessmentPdf,
  deriveTables,
  FORMATS
};
