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
    mfaEnrolledAt: userRow.mfa_enrolled_at || null,
    mfaFailedAttempts: Number(userRow.mfa_failed_attempts || 0),
    mfaLastFailureAt: userRow.mfa_last_failure_at || null,
    mfaLockedUntil: userRow.mfa_locked_until || null,
    passwordHash: userRow.password_hash,
    roleAssignments,
    facilities,
    roles: [...new Set(roleAssignments.map((assignment) => assignment.role))]
  };
}

const USER_COLUMNS = [
  "id",
  "email",
  "password_hash",
  "name",
  "mfa_enabled",
  "mfa_enrolled_at",
  "mfa_failed_attempts",
  "mfa_last_failure_at",
  "mfa_locked_until"
];

async function findUserByEmail(email, trx = db) {
  const userRow = await trx("users")
    .select(USER_COLUMNS)
    .whereRaw("lower(email) = lower(?)", [email || ""])
    .first();

  return hydrateUser(userRow, trx);
}

async function findUserById(userId, trx = db) {
  const userRow = await trx("users")
    .select(USER_COLUMNS)
    .where({ id: userId })
    .first();

  return hydrateUser(userRow, trx);
}

function hasAssignedRole(user, role) {
  return Boolean(user?.roleAssignments?.some((assignment) => assignment.role === role));
}

async function updatePasswordHash(userId, passwordHash, trx = db) {
  if (!userId || !passwordHash) {
    return 0;
  }
  return trx("users").where({ id: userId }).update({ password_hash: passwordHash, updated_at: trx.fn.now() });
}

/**
 * SINGLE-WRITER RULE FOR MFA ENROLLMENT STATE.
 *
 * Per docs/decisions/chunk-4-mfa.md §Bake-ins: this function and
 * `clearMfaEnrollment` are the ONLY code paths that touch
 * `users.mfa_enrolled_at` or `users.mfa_enabled`. Both columns are written
 * atomically in a single UPDATE to guarantee they cannot drift.
 *
 * Do NOT add another writer for either column. If a new caller needs to
 * set enrollment state, route it through this function.
 */
async function setMfaEnrolledAt(userId, timestamp, trx = db) {
  if (!userId || !timestamp) {
    return 0;
  }
  return trx("users")
    .where({ id: userId })
    .update({
      mfa_enrolled_at: timestamp,
      mfa_enabled: true,
      updated_at: trx.fn.now()
    });
}

/**
 * Counterpart to setMfaEnrolledAt. Clears enrollment atomically (both
 * mfa_enrolled_at and mfa_enabled). Called by disable + admin reset paths.
 * See the SINGLE-WRITER RULE comment on setMfaEnrolledAt.
 */
async function clearMfaEnrollment(userId, trx = db) {
  if (!userId) {
    return 0;
  }
  return trx("users")
    .where({ id: userId })
    .update({
      mfa_enrolled_at: null,
      mfa_enabled: false,
      mfa_failed_attempts: 0,
      mfa_last_failure_at: null,
      mfa_locked_until: null,
      updated_at: trx.fn.now()
    });
}

async function updateMfaFailureState(
  userId,
  { failedAttempts, lastFailureAt, lockedUntil },
  trx = db
) {
  if (!userId) return 0;
  const patch = { updated_at: trx.fn.now() };
  if (failedAttempts !== undefined) patch.mfa_failed_attempts = failedAttempts;
  if (lastFailureAt !== undefined) patch.mfa_last_failure_at = lastFailureAt;
  if (lockedUntil !== undefined) patch.mfa_locked_until = lockedUntil;
  return trx("users").where({ id: userId }).update(patch);
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
  publicUser,
  updatePasswordHash,
  setMfaEnrolledAt,
  clearMfaEnrollment,
  updateMfaFailureState
};
