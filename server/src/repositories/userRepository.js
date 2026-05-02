const db = require("../db/knex");

function mapRoleAssignment(row) {
  return {
    id: row.assignment_id,
    userId: row.user_id,
    role: row.role,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    crossFacility: row.cross_facility === true
  };
}

function mapFacility(row) {
  return {
    id: row.facility_id,
    name: row.facility_name,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    configuration: row.facility_configuration || {}
  };
}

function uniqueById(items) {
  return [...new Map(items.filter((item) => item.id).map((item) => [item.id, item])).values()];
}

async function getRoleAssignmentRows(userId, trx = db) {
  return trx("role_assignments as ra")
    .leftJoin("facilities as f", "ra.facility_id", "f.id")
    .join("operators as o", "ra.operator_id", "o.id")
    .select(
      "ra.id as assignment_id",
      "ra.user_id",
      "ra.role",
      "ra.facility_id",
      "ra.operator_id",
      "ra.cross_facility",
      "f.name as facility_name",
      "f.configuration as facility_configuration",
      "o.name as operator_name"
    )
    .where("ra.user_id", userId)
    .orderBy("ra.created_at", "asc");
}

async function hydrateUser(userRow, trx = db) {
  if (!userRow) {
    return null;
  }

  const assignmentRows = await getRoleAssignmentRows(userRow.id, trx);
  const roleAssignments = assignmentRows.map(mapRoleAssignment);
  const facilities = uniqueById(assignmentRows.filter((row) => row.facility_id).map(mapFacility));

  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    mfaEnabled: userRow.mfa_enabled === true,
    passwordHash: userRow.password_hash,
    roleAssignments,
    facilities,
    roles: [...new Set(roleAssignments.map((assignment) => assignment.role))]
  };
}

async function findUserByEmail(email, trx = db) {
  const userRow = await trx("users")
    .select("id", "email", "password_hash", "name", "mfa_enabled")
    .whereRaw("lower(email) = lower(?)", [email || ""])
    .first();

  return hydrateUser(userRow, trx);
}

async function findUserById(userId, trx = db) {
  const userRow = await trx("users")
    .select("id", "email", "password_hash", "name", "mfa_enabled")
    .where({ id: userId })
    .first();

  return hydrateUser(userRow, trx);
}

function hasAssignedRole(user, role) {
  return Boolean(user?.roleAssignments?.some((assignment) => assignment.role === role));
}

function firstRoleAssignment(user) {
  return user?.roleAssignments?.[0] || null;
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mfaEnabled: user.mfaEnabled,
    roleAssignments: user.roleAssignments,
    roles: user.roleAssignments
  };
}

module.exports = {
  findUserByEmail,
  findUserById,
  firstRoleAssignment,
  hasAssignedRole,
  publicUser
};
