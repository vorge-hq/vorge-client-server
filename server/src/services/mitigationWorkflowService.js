const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("./constants");
const { DomainError } = require("./domainError");

function hasNote(note) {
  return typeof note === "string" && note.trim().length > 0;
}

function assertMitigationUpdateAllowed({ role, assessmentState, isAssigned, hasFacilityAccess }) {
  if (role !== ROLES.MITIGATION_OWNER) {
    throw new DomainError("Only Mitigation Owners can update mitigation progress", 403, "ROLE_NOT_ALLOWED");
  }

  if (!hasFacilityAccess || !isAssigned) {
    throw new DomainError("Mitigation is outside the user's assignment or facility scope", 403, "MITIGATION_SCOPE_DENIED");
  }

  if (assessmentState !== ASSESSMENT_STATES.APPROVED) {
    throw new DomainError("Mitigation progress can only be updated after approval", 409, "ASSESSMENT_NOT_APPROVED");
  }
}

function transitionMitigation({ currentStatus, nextStatus, note, role, assessmentState, isAssigned, hasFacilityAccess }) {
  assertMitigationUpdateAllowed({ role, assessmentState, isAssigned, hasFacilityAccess });

  if (currentStatus === MITIGATION_STATUSES.DONE) {
    throw new DomainError("Done is terminal and cannot be reopened", 409, "MITIGATION_DONE_TERMINAL");
  }

  if (nextStatus === currentStatus) {
    return {
      status: currentStatus,
      note: hasNote(note) ? note.trim() : null,
      auditAction: hasNote(note) ? "mitigation.note_added" : "mitigation.no_change"
    };
  }

  if (currentStatus === MITIGATION_STATUSES.OPEN && nextStatus === MITIGATION_STATUSES.IN_PROGRESS) {
    return {
      status: nextStatus,
      note: hasNote(note) ? note.trim() : null,
      auditAction: "mitigation.started"
    };
  }

  if (currentStatus === MITIGATION_STATUSES.IN_PROGRESS && nextStatus === MITIGATION_STATUSES.DONE) {
    if (!hasNote(note)) {
      throw new DomainError("A progress note is required when marking a mitigation Done", 400, "DONE_NOTE_REQUIRED");
    }

    return {
      status: nextStatus,
      note: note.trim(),
      auditAction: "mitigation.completed"
    };
  }

  throw new DomainError(
    `Invalid mitigation transition from ${currentStatus} to ${nextStatus}`,
    409,
    "INVALID_MITIGATION_TRANSITION"
  );
}

module.exports = {
  transitionMitigation,
  assertMitigationUpdateAllowed
};
