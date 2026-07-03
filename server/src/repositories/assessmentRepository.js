const db = require("../db/knex");
const { canAccessFacility } = require("../services/facilityAccessService");
const { ROLES } = require("../services/constants");

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

function assessmentBaseQuery(trx = db) {
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

// SQL-level facility/operator scope for the acting role, mirroring
// canAccessFacility exactly (so list results equal a per-row canAccessFacility
// filter) but pushed into the query — no fetch-all-then-filter-in-JS.
function facilityScopeFor({ user, actingRole }) {
  const assignments = user.roleAssignments || [];
  const facilityIds = assignments
    .filter((a) => a.role === actingRole && a.facilityId)
    .map((a) => a.facilityId);

  const operatorIds = [];
  if (actingRole === ROLES.HQ_EXECUTIVE) {
    for (const a of assignments) {
      if (a.role === ROLES.HQ_EXECUTIVE && a.operatorId) operatorIds.push(a.operatorId);
    }
  }
  if (actingRole === ROLES.ADMIN) {
    for (const a of assignments) {
      if (a.role === ROLES.ADMIN && a.crossFacility === true && a.operatorId) operatorIds.push(a.operatorId);
    }
  }
  return { facilityIds: [...new Set(facilityIds)], operatorIds: [...new Set(operatorIds)] };
}

async function listAssessmentsForUser({ user, actingRole, trx = db }) {
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

async function getAssessmentForUser({ assessmentId, user, actingRole, trx = db }) {
  const row = await assessmentBaseQuery(trx).where("a.id", assessmentId).first();
  const assessment = mapAssessment(row || {});

  if (!row || !isAssessmentVisibleToUser({ assessment, user, actingRole })) {
    return null;
  }

  return assessment;
}

async function getAssessmentBundleForUser({ assessmentId, user, actingRole, trx = db }) {
  const assessment = await getAssessmentForUser({ assessmentId, user, actingRole, trx });

  if (!assessment) {
    return null;
  }

  return getAssessmentBundleById({ assessment, trx });
}

async function getAssessmentBundleById({ assessment, trx = db }) {
  const [assets, threats, links, evaluations, mitigations] = await Promise.all([
    trx("assets").where({ assessment_id: assessment.id }).orderBy("created_at", "asc"),
    trx("threats").where({ assessment_id: assessment.id }).orderBy("created_at", "asc"),
    trx("asset_threat_links").where({ assessment_id: assessment.id }).orderBy("created_at", "asc"),
    trx("evaluations").where({ assessment_id: assessment.id }).orderBy("created_at", "asc"),
    trx("mitigations").where({ assessment_id: assessment.id }).orderBy("created_at", "asc")
  ]);

  return {
    assessment,
    assets: assets.map(mapAsset),
    threats: threats.map(mapThreat),
    links: links.map(mapLink),
    evaluations: evaluations.map(mapEvaluation),
    mitigations: mitigations.map(mapMitigation)
  };
}

async function updateAssessmentState({ assessmentId, fromState, toState, trx = db }) {
  const updatedRows = await trx("assessments")
    .where({ id: assessmentId, state: fromState })
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

async function createVersionSnapshot({ assessmentId, trx = db }) {
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
  createVersionSnapshot,
  getAssessmentBundleForUser,
  getAssessmentForUser,
  listAssessmentsForUser,
  mapAssessment,
  updateAssessmentState
};
