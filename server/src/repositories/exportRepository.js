// P3.5 · Export data assembly. Turns an assessment into the inputs the export
// renderer needs: the content bundle (frozen snapshot when Approved, per §16.2)
// plus the auto-populated front-matter tables — Document Approvals and Version
// Control (§16.4) — resolved from the users table, the audit log sign-off
// events, and the version history.
const { activeConn } = require("../db/requestScope");
const { getAssessmentBundleById } = require("../repositories/assessmentRepository");
const { ASSESSMENT_STATES, ROLES } = require("../services/constants");

// Audit action_type of each sign-off event, mapped to the approval row it fills.
const SIGN_OFF_ACTIONS = {
  author: "assessment.submitted_for_review",
  [ROLES.REVIEWER]: "assessment.review_completed",
  [ROLES.APPROVER]: "assessment.approved"
};

async function namesByUserId(userIds, trx) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await trx("users").whereIn("id", unique).select("id", "name");
  return new Map(rows.map((r) => [r.id, r.name]));
}

// Latest audit entry (by created_at) for each sign-off action on this assessment.
async function latestSignOffs({ assessmentId, trx }) {
  const rows = await trx("audit_log_entries")
    .where({ assessment_id: assessmentId })
    .whereIn("action_type", Object.values(SIGN_OFF_ACTIONS))
    .orderBy("created_at", "asc");

  const latest = {};
  for (const row of rows) {
    latest[row.action_type] = row; // ascending order → last write wins = latest
  }
  return latest;
}

// The Approved snapshot is stored as the whole read bundle; when absent (never
// approved, or an older approval predating snapshots) fall back to the live
// bundle so the caller always gets renderable content.
async function loadExportBundle({ assessment, trx = activeConn() }) {
  if (assessment.state === ASSESSMENT_STATES.APPROVED) {
    const version = await trx("versions")
      .where({ assessment_id: assessment.id })
      .orderBy("version_number", "desc")
      .first();
    if (version && version.assessment_snapshot) {
      return { bundle: version.assessment_snapshot, isSnapshot: true };
    }
  }
  return { bundle: await getAssessmentBundleById({ assessment, trx }), isSnapshot: false };
}

async function getExportFrontMatter({ assessment, trx = activeConn() }) {
  const signOffs = await latestSignOffs({ assessmentId: assessment.id, trx });
  const reviewer = signOffs[SIGN_OFF_ACTIONS[ROLES.REVIEWER]];
  const approver = signOffs[SIGN_OFF_ACTIONS[ROLES.APPROVER]];
  const authorSignOff = signOffs[SIGN_OFF_ACTIONS.author];

  const names = await namesByUserId(
    [assessment.leadAuthorUserId, reviewer?.user_id, approver?.user_id],
    trx
  );

  // Document Approvals (§16.4): Author is the Lead Author at approval time
  // (already current on the row); Reviewer/Approver come from their sign-off
  // events. Names blank until the event exists. Position has no source field
  // in v1 — left blank rather than guessed.
  const approvals = [
    { role: ROLES.AUTHOR, name: names.get(assessment.leadAuthorUserId) || null, position: null, signedAt: authorSignOff?.created_at || null },
    { role: ROLES.REVIEWER, name: reviewer ? names.get(reviewer.user_id) || null : null, position: null, signedAt: reviewer?.created_at || null },
    { role: ROLES.APPROVER, name: approver ? names.get(approver.user_id) || null : null, position: null, signedAt: approver?.created_at || null }
  ];

  // Version Control (§16.4): one row per approved version snapshot.
  const versionRows = await trx("versions")
    .where({ assessment_id: assessment.id })
    .orderBy("version_number", "asc");
  const snapshotAuthorIds = versionRows.map((v) => v.assessment_snapshot?.assessment?.leadAuthorUserId);
  const versionAuthorNames = await namesByUserId(snapshotAuthorIds, trx);
  const versions = versionRows.map((v) => ({
    versionTag: `Rev ${v.version_number}`,
    author: versionAuthorNames.get(v.assessment_snapshot?.assessment?.leadAuthorUserId) || null,
    approver: names.get(approver?.user_id) || null,
    approvedAt: v.approved_at,
    comments: null
  }));

  const isFinal = assessment.state === ASSESSMENT_STATES.APPROVED;
  return {
    approvals,
    versions,
    isFinal,
    // §16.2 names Draft/In Review as non-final; we watermark ANYTHING not yet
    // Approved (a lenient extension that also covers Awaiting Approval — an
    // unapproved doc should never read as final). Only Approved exports are clean.
    watermarkText: isFinal ? null : "DRAFT — NOT A FINAL APPROVED COPY",
    approvalDate: approver?.created_at || null
  };
}

module.exports = { loadExportBundle, getExportFrontMatter };
