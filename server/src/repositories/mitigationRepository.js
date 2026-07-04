const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../services/constants");
const { canAccessFacility } = require("../services/facilityAccessService");
const { DomainError } = require("../services/domainError");

function toDateString(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function mapProgressLog(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    mitigationId: row.mitigation_id,
    userId: row.user_id,
    userName: row.user_name,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    timestamp: row.created_at,
    statusChange:
      row.from_status && row.to_status && row.from_status !== row.to_status
        ? { from: row.from_status, to: row.to_status }
        : null
  };
}

function mapMitigation(row, logs = []) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    assessmentId: row.assessment_id,
    assessmentName: row.assessment_name,
    assessmentState: row.assessment_state,
    evaluationId: row.evaluation_id,
    ownerUserId: row.owner_user_id,
    ownerLabel: row.owner_role_label,
    description: row.description,
    severity: row.severity,
    agreed: row.agreed,
    targetDate: toDateString(row.target_date),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    log: logs
  };
}

function mitigationBaseQuery(trx = activeConn()) {
  return trx("mitigations as m")
    .join("assessments as a", "m.assessment_id", "a.id")
    .join("facilities as f", "m.facility_id", "f.id")
    .join("operators as o", "a.operator_id", "o.id")
    .select(
      "m.*",
      "a.name as assessment_name",
      "a.state as assessment_state",
      "a.operator_id",
      "f.name as facility_name",
      "o.name as operator_name"
    );
}

function isAssignedMitigation({ mitigation, user }) {
  return mitigation.ownerUserId === user.id;
}

function isVisibleMitigation({ mitigation, user, actingRole }) {
  if (actingRole !== ROLES.MITIGATION_OWNER) {
    return false;
  }

  return (
    isAssignedMitigation({ mitigation, user }) &&
    canAccessFacility({
      user,
      actingRole,
      facilityId: mitigation.facilityId,
      operatorId: mitigation.operatorId
    })
  );
}

async function getLogsForMitigations(mitigationIds, trx = activeConn()) {
  if (mitigationIds.length === 0) {
    return new Map();
  }

  const rows = await trx("mitigation_progress_logs as mpl")
    .leftJoin("users as u", "mpl.user_id", "u.id")
    .select("mpl.*", "u.name as user_name")
    .whereIn("mpl.mitigation_id", mitigationIds)
    .orderBy("mpl.created_at", "desc");

  return rows.reduce((logsByMitigation, row) => {
    const log = mapProgressLog(row);
    const existing = logsByMitigation.get(log.mitigationId) || [];
    logsByMitigation.set(log.mitigationId, [...existing, log]);
    return logsByMitigation;
  }, new Map());
}

function calculateKpis(mitigations, now = new Date()) {
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  return mitigations
    .filter((mitigation) => mitigation.assessmentState === ASSESSMENT_STATES.APPROVED)
    .reduce(
      (kpis, mitigation) => {
        if (mitigation.status === MITIGATION_STATUSES.OPEN) {
          kpis.open += 1;
        }

        if (mitigation.status === MITIGATION_STATUSES.IN_PROGRESS) {
          kpis.inProgress += 1;
        }

        if (
          mitigation.targetDate &&
          new Date(`${mitigation.targetDate}T00:00:00.000Z`) < now &&
          mitigation.status !== MITIGATION_STATUSES.DONE
        ) {
          kpis.overdue += 1;
        }

        const doneAt = mitigation.log.find((entry) => entry.toStatus === MITIGATION_STATUSES.DONE)?.timestamp;
        if (mitigation.status === MITIGATION_STATUSES.DONE && doneAt && new Date(doneAt) >= startOfYear) {
          kpis.doneThisYear += 1;
        }

        return kpis;
      },
      { open: 0, inProgress: 0, overdue: 0, doneThisYear: 0 }
    );
}

async function listMine({ user, actingRole, trx = activeConn() }) {
  const rows = await mitigationBaseQuery(trx)
    .where("m.owner_user_id", user.id)
    .orderBy("m.updated_at", "desc");
  const logsByMitigation = await getLogsForMitigations(rows.map((row) => row.id), trx);
  const mitigations = rows
    .map((row) => mapMitigation(row, logsByMitigation.get(row.id) || []))
    .filter((mitigation) => isVisibleMitigation({ mitigation, user, actingRole }));

  return {
    mitigations,
    kpis: calculateKpis(mitigations)
  };
}

async function getMitigationForUser({ mitigationId, user, actingRole, trx = activeConn() }) {
  const row = await mitigationBaseQuery(trx).where("m.id", mitigationId).first();

  if (!row) {
    return null;
  }

  const logsByMitigation = await getLogsForMitigations([row.id], trx);
  const mitigation = mapMitigation(row, logsByMitigation.get(row.id) || []);

  return isVisibleMitigation({ mitigation, user, actingRole }) ? mitigation : null;
}

async function applyMitigationUpdate({ mitigation, transition, userId, note, trx = activeConn() }) {
  if (transition.status !== mitigation.status) {
    await trx("mitigations")
      .where({ id: mitigation.id })
      .update({
        status: transition.status,
        updated_at: trx.fn.now()
      });
  }

  const shouldCreateLog = transition.status !== mitigation.status || transition.note;

  if (!shouldCreateLog) {
    return null;
  }

  const [row] = await trx("mitigation_progress_logs")
    .insert({
      id: crypto.randomUUID(),
      facility_id: mitigation.facilityId,
      mitigation_id: mitigation.id,
      user_id: userId,
      from_status: mitigation.status,
      to_status: transition.status,
      note: transition.note || note || ""
    })
    .returning("*");

  return mapProgressLog(row);
}

// P3 · (f) — Mitigation owner assignment (§7 owner management). Set during
// authoring by the Author, so it runs inside the content write-guard (Author +
// Draft). Sets owner_user_id and/or owner_role_label on a mitigation that must
// belong to this assessment. changed-fields-only diff.
async function assignMitigationOwner({ assessment, mitigationId, ownerUserId, ownerRoleLabel, trx }) {
  const row = await trx("mitigations").where({ id: mitigationId, assessment_id: assessment.id }).first();
  if (!row) {
    throw new DomainError("Mitigation not found in this assessment", 404, "MITIGATION_NOT_FOUND");
  }

  const changes = {};
  const diff = {};
  if (ownerUserId !== undefined && ownerUserId !== row.owner_user_id) {
    changes.owner_user_id = ownerUserId;
    diff.ownerUserId = [row.owner_user_id, ownerUserId];
  }
  if (ownerRoleLabel !== undefined && ownerRoleLabel !== row.owner_role_label) {
    changes.owner_role_label = ownerRoleLabel;
    diff.ownerLabel = [row.owner_role_label, ownerRoleLabel];
  }

  if (Object.keys(changes).length > 0) {
    changes.updated_at = trx.fn.now();
    await trx("mitigations").where({ id: mitigationId }).update(changes);
  }

  return {
    entityId: mitigationId,
    diff,
    result: {
      id: mitigationId,
      ownerUserId: changes.owner_user_id !== undefined ? changes.owner_user_id : row.owner_user_id,
      ownerLabel: changes.owner_role_label !== undefined ? changes.owner_role_label : row.owner_role_label
    }
  };
}

module.exports = {
  applyMitigationUpdate,
  assignMitigationOwner,
  calculateKpis,
  getMitigationForUser,
  listMine
};
