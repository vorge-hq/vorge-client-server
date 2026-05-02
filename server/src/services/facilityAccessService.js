const { ROLES } = require("./constants");

function hasFacilityRole({ user, facilityId, role }) {
  return (user.roleAssignments || []).some((assignment) => {
    const facilityMatches = assignment.facilityId === facilityId || assignment.facilityIds?.includes(facilityId);
    const roleMatches = !role || assignment.role === role;
    return facilityMatches && roleMatches;
  });
}

function canAccessFacility({ user, facilityId, operatorId, actingRole }) {
  if (!user || !facilityId) {
    return false;
  }

  if (hasFacilityRole({ user, facilityId, role: actingRole })) {
    return true;
  }

  if (actingRole === ROLES.HQ_EXECUTIVE) {
    return (user.roleAssignments || []).some((assignment) => {
      return assignment.role === ROLES.HQ_EXECUTIVE && assignment.operatorId === operatorId;
    });
  }

  if (actingRole === ROLES.ADMIN) {
    return (user.roleAssignments || []).some((assignment) => {
      return assignment.role === ROLES.ADMIN && assignment.crossFacility === true && assignment.operatorId === operatorId;
    });
  }

  return false;
}

function filterFacilityScopedRecords({ records, user, actingRole }) {
  return records.filter((record) =>
    canAccessFacility({
      user,
      facilityId: record.facilityId,
      operatorId: record.operatorId,
      actingRole
    })
  );
}

module.exports = {
  hasFacilityRole,
  canAccessFacility,
  filterFacilityScopedRecords
};
