const ROLES = Object.freeze({
  AUTHOR: "Author",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  HQ_EXECUTIVE: "HQ Executive",
  ADMIN: "Admin",
  MITIGATION_OWNER: "Mitigation Owner",
  GUEST: "Guest"
});

const ASSESSMENT_STATES = Object.freeze({
  DRAFT: "Draft",
  IN_REVIEW: "In Review",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved"
});

const MITIGATION_STATUSES = Object.freeze({
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  DONE: "Done"
});

// The five enterprise library types (§12 / businesslogic entity table). Every
// library_entries.type must be one of these; the create/update Zod schema keys
// off this list so an out-of-vocabulary type is a 400, never a stored row.
const LIBRARY_TYPES = Object.freeze([
  "Scenarios",
  "Mitigations",
  "Vulnerabilities",
  "Controls",
  "Consequences"
]);

module.exports = {
  ROLES,
  ASSESSMENT_STATES,
  MITIGATION_STATUSES,
  LIBRARY_TYPES
};
