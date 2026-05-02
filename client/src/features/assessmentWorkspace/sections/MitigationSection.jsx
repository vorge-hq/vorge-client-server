import { useState } from "react";
import { Banner } from "../../../components/Banner";
import { AgreedChip, SeverityChip, StatusChip } from "../../../components/Chip";
import { ASSESSMENT_STATES } from "../assessmentModel";
import { SectionShell } from "./SectionShell";

function MitigationLog({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <p className="rounded-lg bg-white p-3 text-xs text-slate-500">
        No progress notes yet. Notes are added by the Mitigation Owner after approval.
      </p>
    );
  }

  return (
    <ol className="grid gap-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg bg-white p-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {entry.userName} · {entry.roleLabel}
            </span>
            <span>{new Date(entry.timestamp).toLocaleString()}</span>
          </div>
          <p className="mt-1 text-slate-800">{entry.text}</p>
          {entry.statusChange ? (
            <p className="mt-2 text-xs">
              Status: {entry.statusChange.from} → <strong>{entry.statusChange.to}</strong>
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function MitigationSection({ assessment, bundle }) {
  const isApproved = assessment.state === ASSESSMENT_STATES.APPROVED;
  const [expanded, setExpanded] = useState(() => new Set());

  function toggle(id) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <SectionShell
      number={7}
      title="Proposed Mitigation"
      description="Auto-populated from Section 6 evaluations. Two-phase lifecycle: Author edits pre-approval, Mitigation Owner tracks post-approval."
    >
      {isApproved ? (
        <Banner tone="success" title="Approved — tracking phase">
          Mitigation Owners update Status and add progress notes from My Mitigations. Other fields are
          locked.
        </Banner>
      ) : (
        <Banner tone="info" title="Pre-approval phase">
          Authors edit description, agreed status, owner, target date, and comment. Severity is read-only
          and derived from R1.
        </Banner>
      )}

      <ul className="grid gap-3">
        {bundle.mitigations.map((mitigation) => {
          const overdue =
            mitigation.status !== "Done" && new Date(mitigation.targetDate) < new Date();
          const showLog = expanded.has(mitigation.id);
          return (
            <li key={mitigation.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityChip severity={mitigation.severity} />
                    <AgreedChip agreed={mitigation.agreed} />
                    <StatusChip status={mitigation.status} />
                    {overdue ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Overdue
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-semibold text-slate-900">{mitigation.description}</p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Owner
                      </dt>
                      <dd className="mt-1 text-slate-700">{mitigation.ownerLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Target date
                      </dt>
                      <dd className="mt-1 text-slate-700">
                        {new Date(mitigation.targetDate).toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Comment
                      </dt>
                      <dd className="mt-1 text-slate-700">{mitigation.comment}</dd>
                    </div>
                  </dl>
                  {mitigation.log?.length ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Latest progress: {mitigation.log[mitigation.log.length - 1].text}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(mitigation.id)}
                    className="btn-secondary"
                  >
                    {showLog ? "Hide log" : `Show log (${mitigation.log?.length || 0})`}
                  </button>
                </div>
              </div>
              {showLog ? (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <MitigationLog entries={mitigation.log} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
