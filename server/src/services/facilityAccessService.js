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

// SQL-level facility/operator scope for the acting role, mirroring
// canAccessFacility exactly (so a list query's results equal a per-row
// canAccessFacility filter) but expressed as id sets a query can push into a
// WHERE — no fetch-all-then-filter-in-JS. Author/Reviewer/etc → their assigned
// facilities; HQ Executive → its operator(s); cross-facility Admin → its
// operator(s). Lives here beside canAccessFacility (not in a repository) so both
// repositories and the facility-scope middleware can share it without importing
// a data-access module.
function facilityScopeFor({ user, actingRole }) {
  const assignments = (user && user.roleAssignments) || [];
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

module.exports = {
  hasFacilityRole,
  canAccessFacility,
  filterFacilityScopedRecords,
  facilityScopeFor
};
