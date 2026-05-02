const ROLES = Object.freeze({
  AUTHOR: "Author",
  REVIEWER: "Reviewer",
  APPROVER: "Approver",
  HQ_EXECUTIVE: "HQ Executive",
  ADMIN: "Admin",
  MITIGATION_OWNER: "Mitigation Owner"
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

module.exports = {
  ROLES,
  ASSESSMENT_STATES,
  MITIGATION_STATUSES
};
