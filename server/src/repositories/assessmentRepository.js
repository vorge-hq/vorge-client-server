const { activeConn } = require("../db/requestScope");
const { canAccessFacility, facilityScopeFor } = require("../services/facilityAccessService");

const SECTION_NAMES = Object.freeze([
  "Executive Summary",
  "Facility Information",
  "Asset Disaggregation",
  "Threat Assessment",
  "Asset Attractiveness Cross-Reference",
  "Vulnerability Assessment & Risk Treatment",
  "Proposed Mitigation",
  "Conclusion",
  "Appendices"
]);

function mapAssessment(row) {
  return {
    id: row.id,
    operatorId: row.operator_id,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    operatorName: row.operator_name,
    name: row.name,
    state: row.state,
    version: row.lock_version,
    lockVersion: row.lock_version,
    leadAuthorUserId: row.lead_author_user_id,
    contributors: row.contributors || [],
    createdAt: row.created_at,
    lastUpdated: row.updated_at,
    sections: SECTION_NAMES
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    assessmentId: row.assessment_id,
    name: row.name,
    assetType: row.asset_type,
    criticality: row.criticality,
    details: row.details || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapThreat(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    assessmentId: row.assessment_id,
    name: row.name,
    likelihood: row.likelihood,
    details: row.details || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLink(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    assessmentId: row.assessment_id,
    assetId: row.asset_id,
    threatId: row.threat_id,
    enabled: row.enabled === true
  };
}

function mapEvaluation(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    assessmentId: row.assessment_id,
    assetId: row.asset_id,
    threatId: row.threat_id,
    scenario: row.scenario,
    controls: row.controls,
    vulnerabilities: row.vulnerabilities,
    proposedMitigation: row.proposed_mitigation,
    r1: row.r1 || {},
    r2: row.r2 || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMitigation(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    assessmentId: row.assessment_id,
    evaluationId: row.evaluation_id,
    ownerUserId: row.owner_user_id,
    ownerLabel: row.owner_role_label,
    description: row.description,
    severity: row.severity,
    agreed: row.agreed,
    targetDate: row.target_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assessmentBaseQuery(trx = activeConn()) {
  return trx("assessments as a")
    .join("facilities as f", "a.facility_id", "f.id")
    .join("operators as o", "a.operator_id", "o.id")
    .select(
      "a.*",
      "f.name as facility_name",
      "o.name as operator_name"
    );
}

function isAssessmentVisibleToUser({ assessment, user, actingRole }) {
  return canAccessFacility({
    user,
    actingRole,
    facilityId: assessment.facilityId,
    operatorId: assessment.operatorId
  });
}


async function listAssessmentsForUser({ user, actingRole, trx = activeConn() }) {
  const { facilityIds, operatorIds } = facilityScopeFor({ user, actingRole });

  // No accessible facility or operator → no rows (default-deny), without a query.
  if (facilityIds.length === 0 && operatorIds.length === 0) {
    return [];
  }

  const rows = await assessmentBaseQuery(trx)
    .where((builder) => {
      if (facilityIds.length > 0) builder.orWhereIn("a.facility_id", facilityIds);
      if (operatorIds.length > 0) builder.orWhereIn("a.operator_id", operatorIds);
    })
    .orderBy("a.updated_at", "desc");

  return rows.map(mapAssessment);
}

async function getAssessmentForUser({ assessmentId, user, actingRole, trx = activeConn() }) {
  const row = await assessmentBaseQuery(trx).where("a.id", assessmentId).first();
  const assessment = mapAssessment(row || {});

  if (!row || !isAssessmentVisibleToUser({ assessment, user, actingRole })) {
    return null;
  }

  return assessment;
}

async function getAssessmentBundleForUser({ assessmentId, user, actingRole, trx = activeConn() }) {
  const assessment = await getAssessmentForUser({ assessmentId, user, actingRole, trx });

  if (!assessment) {
    return null;
  }

  return getAssessmentBundleById({ assessment, trx });
}

async function getAssessmentBundleById({ assessment, trx = activeConn() }) {
  // Sequential, not Promise.all: trx is now (under the facilityScope middleware)
  // a single transaction connection, and a connection can only run one query at
  // a time — issuing these concurrently trips pg's "client is already executing
  // a query" deprecation and would break on pg@9. Five indexed point-lookups run
  // fast serially.
  const assets = await trx("assets").where({ assessment_id: assessment.id }).orderBy("created_at", "asc");
  const threats = await trx("threats").where({ assessment_id: assessment.id }).orderBy("created_at", "asc");
  const links = await trx("asset_threat_links").where({ assessment_id: assessment.id }).orderBy("created_at", "asc");
  const evaluations = await trx("evaluations").where({ assessment_id: assessment.id }).orderBy("created_at", "asc");
  const mitigations = await trx("mitigations").where({ assessment_id: assessment.id }).orderBy("created_at", "asc");
  const sectionRows = await trx("assessment_sections").where({ assessment_id: assessment.id });

  // Narrative section text (Sections 1/2/8) keyed by section number, so a
  // PUT /sections/:n round-trips through the GET bundle. Absent sections are
  // simply not present (client treats missing as empty).
  const sectionTexts = {};
  for (const row of sectionRows) {
    sectionTexts[row.section_number] = row.content_text;
  }

  return {
    assessment,
    assets: assets.map(mapAsset),
    threats: threats.map(mapThreat),
    links: links.map(mapLink),
    evaluations: evaluations.map(mapEvaluation),
    mitigations: mitigations.map(mapMitigation),
    sectionTexts
  };
}

async function updateAssessmentState({ assessmentId, fromState, toState, expectedLockVersion = null, trx = activeConn() }) {
  const where = { id: assessmentId, state: fromState };
  // Optimistic concurrency for workflow actions (withdraw/recall race, §17.7):
  // when the client sends the lock_version it read, a mismatch means another
  // actor moved first → 0 rows → the caller's 409. When omitted, the state guard
  // alone applies (back-compatible).
  if (expectedLockVersion !== null && expectedLockVersion !== undefined) {
    where.lock_version = expectedLockVersion;
  }

  const updatedRows = await trx("assessments")
    .where(where)
    .update({
      state: toState,
      lock_version: trx.raw("lock_version + 1"),
      updated_at: trx.fn.now()
    })
    .returning("id");

  if (updatedRows.length === 0) {
    return null;
  }

  const row = await assessmentBaseQuery(trx).where("a.id", assessmentId).first();
  return mapAssessment(row);
}

// P3 · (d) — Contributors (Section 9.A) live as a jsonb array ON the assessment
// row. PUT replaces the whole list. Runs inside the write-guard savepoint; the
// guard's lock_version bump on the same row is a separate statement.
async function replaceContributors({ assessment, contributors, trx = activeConn() }) {
  await trx("assessments")
    .where({ id: assessment.id })
    .update({ contributors: JSON.stringify(contributors), updated_at: trx.fn.now() });
  return {
    entityId: assessment.id,
    diff: { contributors: [assessment.contributors || [], contributors] },
    result: { contributors }
  };
}

// P3 · (f) — Lead Author reassignment (§5.5). role_assignments carries no RLS
// policy (auth/lookup table), so this lookup is safe on the scoped connection.
async function userHasFacilityRole({ userId, facilityId, role, trx = activeConn() }) {
  const row = await trx("role_assignments").where({ user_id: userId, facility_id: facilityId, role }).first();
  return Boolean(row);
}

async function reassignLeadAuthor({ assessment, newLeadAuthorUserId, trx = activeConn() }) {
  await trx("assessments")
    .where({ id: assessment.id })
    .update({ lead_author_user_id: newLeadAuthorUserId, updated_at: trx.fn.now() });
  return { entityId: assessment.id, previous: assessment.leadAuthorUserId, next: newLeadAuthorUserId };
}

async function createVersionSnapshot({ assessmentId, trx = activeConn() }) {
  const row = await assessmentBaseQuery(trx).where("a.id", assessmentId).first();

  if (!row) {
    return null;
  }

  const bundle = await getAssessmentBundleById({ assessment: mapAssessment(row), trx });

  const facility = await trx("facilities").where({ id: bundle.assessment.facilityId }).first();
  const latest = await trx("versions")
    .where({ assessment_id: assessmentId })
    .max("version_number as versionNumber")
    .first();

  const [version] = await trx("versions")
    .insert({
      id: require("crypto").randomUUID(),
      facility_id: bundle.assessment.facilityId,
      assessment_id: assessmentId,
      version_number: Number(latest?.versionNumber || 0) + 1,
      assessment_snapshot: bundle,
      configuration_snapshot: facility?.configuration || {},
      approved_at: trx.fn.now()
    })
    .returning("*");

  return version;
}

module.exports = {
  SECTION_NAMES,
  createVersionSnapshot,
  getAssessmentBundleById,
  getAssessmentBundleForUser,
  getAssessmentForUser,
  listAssessmentsForUser,
  mapAssessment,
  mapAsset,
  mapThreat,
  mapLink,
  mapEvaluation,
  replaceContributors,
  reassignLeadAuthor,
  userHasFacilityRole,
  updateAssessmentState
};
