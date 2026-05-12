import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  X
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Banner } from "../../components/Banner";
import { AgreedChip, SeverityChip, StateChip, StatusChip } from "../../components/Chip";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { getMitigationKpis } from "../../features/mitigationOwner/mitigationRules";

const STATUS_OPTIONS = ["Open", "In Progress", "Done"];

function MitigationDetailModal({ mitigation, onClose, onSave }) {
  const [status, setStatus] = useState(mitigation.status);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const isApproved = mitigation.assessmentState === "Approved";
  const movingToDone = status === "Done";

  function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (!isApproved) {
      setError("Mitigation progress can only be updated after the parent assessment is Approved.");
      return;
    }
    if (movingToDone && !note.trim()) {
      setError("A progress note is required when marking a mitigation Done.");
      return;
    }
    if (mitigation.status === "Done" && status !== "Done") {
      setError("Done is terminal and cannot be reopened.");
      return;
    }
    onSave({ status, note: note.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-zinc-200 bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div>
            <button
              type="button"
              onClick={onClose}
              className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft size={11} aria-hidden /> Back to my mitigations
            </button>
            <p className="text-[14px] font-semibold text-zinc-900">{mitigation.assetThreat}</p>
            <p className="text-[11px] text-zinc-500">
              {mitigation.facility} · {mitigation.cycle} · Assigned by {mitigation.assignedBy}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px]">
          <section className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Mitigation</p>
              <p className="mt-1 text-zinc-800">{mitigation.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Severity & target</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <SeverityChip severity={mitigation.severity} />
                <span className="text-[12px] text-zinc-700">Target {mitigation.targetDate}</span>
                {mitigation.overdue ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    Overdue
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Assessment state</p>
              <div className="mt-1">
                <StateChip state={mitigation.assessmentState} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Current status</p>
              <div className="mt-1">
                <StatusChip status={mitigation.status} />
              </div>
            </div>
          </section>

          {!isApproved ? (
            <Banner tone="info" title="Read-only until approved">
              Mitigation progress is editable only after the parent assessment is Approved. You can review the
              context now and add updates once approval is recorded.
            </Banner>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-3">
              <label className="block">
                <span className="field-label mb-1.5 block">Status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="field-control text-[13px]"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label mb-1.5 block">
                  Progress note {movingToDone ? <span className="text-red-600">*</span> : null}
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  className="field-control text-[13px]"
                  placeholder={
                    movingToDone
                      ? "Justify why this mitigation can be marked Done. Note is appended to the immutable log."
                      : "Optional progress update."
                  }
                />
              </label>
              {error ? <Banner tone="danger" title="Cannot save">{error}</Banner> : null}
              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-3">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {movingToDone ? "Mark as Done" : status === mitigation.status ? "Add note" : "Update status"}
                </button>
              </div>
            </form>
          )}

          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-zinc-700">Progress log</h3>
            {mitigation.log?.length ? (
              <ol className="grid gap-2 text-[12px]">
                {mitigation.log.map((entry, idx) => (
                  <li key={entry.id || idx} className="rounded-md border border-zinc-200 bg-white p-2">
                    <p className="text-[10px] tabular-nums text-zinc-400">
                      {entry.timestamp || entry.ts}
                    </p>
                    <p className="text-[12px] text-zinc-700">
                      <span className="font-semibold">{entry.userName || entry.author}</span>{" "}
                      <span className="text-[10px] text-zinc-500">
                        ({entry.roleLabel || entry.authorRole})
                      </span>{" "}
                      — {entry.text}
                    </p>
                    {entry.statusChange ? (
                      <p className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                        {entry.statusChange.from} → {entry.statusChange.to}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-[12px] text-zinc-500">
                No log entries yet. Add one to start tracking progress.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function MitigationsPage() {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [activeId, setActiveId] = useState(null);

  const myMitigations = workspace.myMitigations.filter(
    (m) => m.ownerUserId === session.user.id
  );

  const filtered = useMemo(() => {
    if (filter === "all") return myMitigations;
    return myMitigations.filter((m) => m.status === filter);
  }, [myMitigations, filter]);

  const kpis = getMitigationKpis(myMitigations);

  const pending = myMitigations.filter((m) => m.assessmentState !== "Approved");
  const active = activeId ? myMitigations.find((m) => m.id === activeId) : null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">My mitigations</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Mitigations assigned to you across facilities. Updates apply only after the parent assessment is
            Approved.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <Lock size={10} aria-hidden /> Acting as Mitigation Owner
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Open</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{kpis.open}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">In progress</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{kpis.inProgress}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Overdue</div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${kpis.overdue > 0 ? "text-destructive" : ""}`}
          >
            {kpis.overdue}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Done this year</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{kpis.doneThisYear}</div>
        </div>
      </section>

      {pending.length ? (
        <Banner tone="warn" title={`${pending.length} pending assignment${pending.length === 1 ? "" : "s"}`}>
          These mitigations are assigned to you but the parent assessment is not yet Approved. They become
          editable once approval is recorded.
        </Banner>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
          <span className="text-[13px] font-medium text-zinc-700">Assigned to me</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="field-control text-[12px] sm:w-44"
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
        </header>
        <ul className="divide-y divide-zinc-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-zinc-500">
              No mitigations match this filter.
            </li>
          ) : null}
          {filtered.map((mitigation) => (
            <li key={mitigation.id} className="px-4 py-3 hover:bg-zinc-50/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={mitigation.severity} />
                    <StatusChip status={mitigation.status} />
                    <StateChip state={mitigation.assessmentState} />
                    <AgreedChip agreed={mitigation.agreed} />
                    {mitigation.overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        <AlertTriangle size={9} aria-hidden /> Overdue
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium text-zinc-900">{mitigation.assetThreat}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-600">{mitigation.description}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                    <Clock size={10} aria-hidden /> Target {mitigation.targetDate} · {mitigation.facility}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveId(mitigation.id)}
                  className="btn-secondary inline-flex items-center gap-1 text-[12px]"
                >
                  {mitigation.assessmentState === "Approved" ? "Update" : "View"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex max-w-2xl items-start gap-2 text-[12px] text-zinc-500">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          You only see assigned mitigations. Marking a mitigation Done requires a justifying note and is
          terminal. Once Done, the entry remains visible but cannot be reopened.
        </span>
      </div>

      {active ? (
        <MitigationDetailModal
          mitigation={active}
          onClose={() => setActiveId(null)}
          onSave={async ({ status, note }) => {
            const result = await workspace.appendMitigationLogEntry({
              mitigationId: active.id,
              status,
              note,
              userName: session.user.name,
              roleLabel: "IT Security"
            });
            if (result?.error) {
              workspace.showToast(result.error, { tone: "error" });
              return;
            }
            workspace.showToast(
              status === "Done"
                ? "Mitigation marked as Done"
                : note
                  ? "Progress note added"
                  : `Status updated to ${status}`
            );
            setActiveId(null);
          }}
        />
      ) : null}

      <p className="inline-flex items-center gap-1 text-[10px] text-zinc-400">
        <CheckCircle2 size={10} aria-hidden /> Audit log records every status change with timestamp and IP.
      </p>
    </div>
  );
}
