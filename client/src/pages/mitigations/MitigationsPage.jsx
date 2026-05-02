import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Banner } from "../../components/Banner";
import { Card, CardHeader } from "../../components/Card";
import {
  AgreedChip,
  Chip,
  SeverityChip,
  StatusChip,
  StateChip
} from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { FormField, Select, TextArea } from "../../components/FormField";
import { KpiCard } from "../../components/KpiCard";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { ASSESSMENTS } from "../../data/assessments";
import { FACILITIES } from "../../data/operators";
import { MITIGATIONS } from "../../data/mitigations";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";
import {
  MITIGATION_STATUSES,
  getMitigationKpis,
  validateMitigationUpdate
} from "../../features/mitigationOwner/mitigationRules";

function getAssessment(assessmentId) {
  return ASSESSMENTS.find((a) => a.id === assessmentId);
}

function getFacility(facilityId) {
  return FACILITIES.find((f) => f.id === facilityId);
}

function MitigationDetailModal({ mitigation, assessment, onClose }) {
  const isApproved = assessment?.state === ASSESSMENT_STATES.APPROVED;
  const [status, setStatus] = useState(mitigation.status);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(null);

  const validation = validateMitigationUpdate({
    currentStatus: mitigation.status,
    nextStatus: status,
    note,
    assessmentState: assessment?.state
  });

  const buttonLabel =
    status === MITIGATION_STATUSES.DONE && mitigation.status !== MITIGATION_STATUSES.DONE
      ? "Mark as Done"
      : status !== mitigation.status
      ? "Update status"
      : "Add note";

  function handleSubmit(event) {
    event.preventDefault();
    if (!validation.valid) {
      return;
    }
    setSubmitted({ status, note, timestamp: new Date().toISOString() });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mitigation.description}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {isApproved && !submitted ? (
            <button
              type="submit"
              form="mitigation-update"
              className="btn-primary"
              disabled={!validation.valid}
            >
              {buttonLabel}
            </button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="section-eyebrow">Severity</p>
            <SeverityChip severity={mitigation.severity} className="mt-1" />
          </div>
          <div>
            <p className="section-eyebrow">Agreed</p>
            <AgreedChip agreed={mitigation.agreed} className="mt-1" />
          </div>
          <div>
            <p className="section-eyebrow">Target date</p>
            <p className="mt-1 text-slate-700">{new Date(mitigation.targetDate).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Assessment</p>
          <p className="mt-1 font-semibold text-slate-900">{assessment?.name}</p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <StateChip state={assessment?.state} />
            <span className="text-slate-500">{getFacility(assessment?.facilityId)?.name}</span>
          </div>
        </div>

        {!isApproved ? (
          <Banner tone="info" title="Read-only until approval">
            You'll be able to update status and add progress notes once the assessment is approved.
          </Banner>
        ) : submitted ? (
          <Banner tone="success" title="Update saved">
            {submitted.status !== mitigation.status
              ? `Status set to ${submitted.status}.`
              : "Progress note added."}
          </Banner>
        ) : (
          <form id="mitigation-update" onSubmit={handleSubmit} className="grid gap-3">
            <FormField label="Status">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value={MITIGATION_STATUSES.OPEN}>Open</option>
                <option value={MITIGATION_STATUSES.IN_PROGRESS}>In Progress</option>
                <option value={MITIGATION_STATUSES.DONE}>Done</option>
              </Select>
            </FormField>
            <FormField
              label="Progress note"
              required={status === MITIGATION_STATUSES.DONE && mitigation.status !== MITIGATION_STATUSES.DONE}
              error={validation.errors[0]}
              hint="Required when marking Done. Notes are append-only."
            >
              <TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
            </FormField>
          </form>
        )}

        <div>
          <p className="section-eyebrow">Progress timeline</p>
          {mitigation.log?.length ? (
            <ol className="mt-2 grid gap-2">
              {mitigation.log.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>
                      {entry.userName} · {entry.roleLabel}
                    </span>
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-slate-800">{entry.text}</p>
                  {entry.statusChange ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Status: {entry.statusChange.from} → <strong>{entry.statusChange.to}</strong>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No progress entries yet.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function MitigationsPage() {
  const { session } = useAuth();
  const [filter, setFilter] = useState("All");
  const [activeMitigation, setActiveMitigation] = useState(null);

  const myMitigations = useMemo(
    () => MITIGATIONS.filter((m) => m.ownerUserId === session.user.id || m.ownerLabel === "Security Manager"),
    [session.user.id]
  );

  const kpis = getMitigationKpis(myMitigations);
  const overdueCount = kpis.overdue;

  const filtered = useMemo(() => {
    if (filter === "All") return myMitigations;
    return myMitigations.filter((m) => m.status === filter);
  }, [filter, myMitigations]);

  const pendingAssignments = myMitigations.filter((m) => {
    const assessment = getAssessment(m.assessmentId);
    return assessment?.state !== ASSESSMENT_STATES.APPROVED;
  });

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow={`Mitigation Owner · ${session.user.name}`}
        title="My Mitigations"
        description="Update status and add progress notes on approved mitigations. Pre-approval mitigations are read-only."
      />

      {pendingAssignments.length > 0 ? (
        <Banner tone="info" title="Pending assignments">
          You've been proposed as Owner on {pendingAssignments.length} mitigation
          {pendingAssignments.length === 1 ? "" : "s"} in assessments that are not yet approved.
        </Banner>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open" value={kpis.open} />
        <KpiCard label="In Progress" value={kpis.inProgress} tone="info" />
        <KpiCard label="Overdue" value={overdueCount} tone={overdueCount ? "warn" : "default"} />
        <KpiCard label="Done this year" value={kpis.doneThisYear} tone="success" />
      </section>

      <Card>
        <CardHeader
          eyebrow="Filters"
          title="Filter assigned mitigations"
          action={
            <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option>All</option>
              <option value={MITIGATION_STATUSES.OPEN}>Open</option>
              <option value={MITIGATION_STATUSES.IN_PROGRESS}>In Progress</option>
              <option value={MITIGATION_STATUSES.DONE}>Done</option>
            </Select>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState
            title="No mitigations match the filter"
            description="Try clearing the filter or wait for new assignments."
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {filtered.map((mitigation) => {
              const assessment = getAssessment(mitigation.assessmentId);
              const facility = getFacility(mitigation.facilityId);
              const overdue =
                mitigation.status !== "Done" && new Date(mitigation.targetDate) < new Date();
              return (
                <li
                  key={mitigation.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityChip severity={mitigation.severity} />
                      <StatusChip status={mitigation.status} />
                      <StateChip state={assessment?.state} />
                      {overdue ? <Chip tone="warn">Overdue</Chip> : null}
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">{mitigation.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {facility?.name} · {assessment?.name} · Target{" "}
                      {new Date(mitigation.targetDate).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={
                      assessment?.state === ASSESSMENT_STATES.APPROVED ? "btn-primary" : "btn-secondary"
                    }
                    onClick={() => setActiveMitigation(mitigation)}
                  >
                    {assessment?.state === ASSESSMENT_STATES.APPROVED ? "Update" : "View"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-xs text-slate-500">
          You can update Status and add progress notes only on mitigations in approved assessments. To
          revise other fields, the assessment Author must run a new cycle.
        </p>
      </Card>

      {activeMitigation ? (
        <MitigationDetailModal
          mitigation={activeMitigation}
          assessment={getAssessment(activeMitigation.assessmentId)}
          onClose={() => setActiveMitigation(null)}
        />
      ) : null}
    </section>
  );
}
