export const MITIGATION_STATUSES = Object.freeze({
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  DONE: "Done"
});

export function validateMitigationUpdate({ currentStatus, nextStatus, note, assessmentState }) {
  const errors = [];

  if (assessmentState !== "Approved") {
    errors.push("Mitigation progress can only be updated after approval.");
  }

  if (currentStatus === MITIGATION_STATUSES.DONE && nextStatus !== MITIGATION_STATUSES.DONE) {
    errors.push("Done is terminal and cannot be reopened.");
  }

  if (nextStatus === MITIGATION_STATUSES.DONE && currentStatus !== MITIGATION_STATUSES.DONE && !note?.trim()) {
    errors.push("A progress note is required when marking a mitigation Done.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function getMitigationKpis(mitigations) {
  const now = new Date();

  return mitigations.reduce(
    (kpis, mitigation) => {
      if (mitigation.status === MITIGATION_STATUSES.OPEN) {
        kpis.open += 1;
      }

      if (mitigation.status === MITIGATION_STATUSES.IN_PROGRESS) {
        kpis.inProgress += 1;
      }

      if (mitigation.status === MITIGATION_STATUSES.DONE) {
        kpis.doneThisYear += new Date(mitigation.updatedAt || now).getFullYear() === now.getFullYear() ? 1 : 0;
      }

      if (mitigation.status !== MITIGATION_STATUSES.DONE && mitigation.targetDate && new Date(mitigation.targetDate) < now) {
        kpis.overdue += 1;
      }

      return kpis;
    },
    { open: 0, inProgress: 0, overdue: 0, doneThisYear: 0 }
  );
}
