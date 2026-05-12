import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, Info } from "lucide-react";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { AuditLogPanel } from "../../features/assessmentWorkspace/modals";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";

function StatusPill({ status }) {
  const styles = {
    "Awaiting Review": "bg-secondary-50 text-secondary-800",
    "Not yet submitted": "bg-zinc-100 text-zinc-700"
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || styles["Not yet submitted"]}`}>
      {status}
    </span>
  );
}

export function ReviewerDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [auditOpen, setAuditOpen] = useState(false);
  const active = workspace.assessmentsById[ACTIVE_ASSESSMENT_ID];
  const isAwaitingReview = active?.state === ASSESSMENT_STATES.IN_REVIEW;

  const queue = [
    {
      id: "r1",
      facility: "Lagos Refinery",
      cycle: "2026 SRA",
      author: "Adaeze Okeke",
      submitted: isAwaitingReview ? "Just now" : "—",
      due: "2026-05-08",
      status: isAwaitingReview ? "Awaiting Review" : "Not yet submitted",
      isCurrent: true
    },
    {
      id: "r2",
      facility: "Bonny Terminal",
      cycle: "2026 SRA",
      author: "Hassan Al-Mansoori",
      submitted: "2 days ago",
      due: "2026-05-12",
      status: "Awaiting Review",
      isCurrent: false
    },
    {
      id: "r3",
      facility: "Fujairah Marine Terminal",
      cycle: "2026 SRA",
      author: "Nadia Haddad",
      submitted: "5 days ago",
      due: "2026-04-30",
      status: "Awaiting Review",
      isCurrent: false,
      overdue: true
    }
  ];

  const completed = [
    {
      id: "c1",
      facility: "Lagos Refinery",
      cycle: "2025 SRA",
      completedOn: "2025-09-10",
      actions: "Marked review complete · forwarded to Rafael Castellanos"
    },
    {
      id: "c2",
      facility: "Bonny Terminal",
      cycle: "2025 SRA",
      completedOn: "2025-08-22",
      actions: "3 fields locked · 7 comments · sent back once"
    }
  ];

  const totalAwaiting = queue.filter((q) => q.status === "Awaiting Review").length;
  const overdueCount = queue.filter((q) => q.overdue).length;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Reviewer queue</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Assessments submitted for your review. You can comment and lock fields, but cannot edit content.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <Eye size={10} aria-hidden /> Reviewer: Mei-Lin Tanaka
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Awaiting your review
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalAwaiting}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Across {totalAwaiting} facility/facilities</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Overdue</div>
          <div
            className={`text-2xl font-semibold tabular-nums ${overdueCount > 0 ? "text-secondary-700" : ""}`}
          >
            {overdueCount}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Past target review date</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Completed this quarter
          </div>
          <div className="text-2xl font-semibold tabular-nums">2</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Reviews marked complete and forwarded</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700">
          Awaiting your review
        </header>
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-white">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 text-left">Facility / Cycle</th>
              <th className="w-32 px-3 py-2 text-left">Author</th>
              <th className="w-32 px-3 py-2 text-left">Submitted</th>
              <th className="w-32 px-3 py-2 text-left">Review due</th>
              <th className="w-36 px-3 py-2 text-left">Status</th>
              <th className="w-24 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50/40">
                <td className="px-3 py-2.5">
                  <div className="text-[13px] font-medium text-zinc-900">{row.facility}</div>
                  <div className="text-[11px] text-zinc-500">{row.cycle}</div>
                </td>
                <td className="px-3 py-2.5 text-[12px] text-zinc-700">{row.author}</td>
                <td className="px-3 py-2.5 text-[12px] text-zinc-700">{row.submitted}</td>
                <td className="px-3 py-2.5">
                  <div
                    className={`text-[12px] tabular-nums ${row.overdue ? "text-destructive" : "text-zinc-700"}`}
                  >
                    {row.due}
                  </div>
                  {row.overdue ? (
                    <div className="text-[10px] text-destructive">⚠ Overdue</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.isCurrent && row.status === "Awaiting Review" ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${ACTIVE_ASSESSMENT_ID}/sections/1`)}
                      className="btn-primary inline-flex items-center gap-1 text-[12px]"
                    >
                      Open <ArrowRight size={11} aria-hidden />
                    </button>
                  ) : (
                    <span className="text-[11px] italic text-zinc-400">Other reviewer</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
          <span className="text-[13px] font-medium text-zinc-700">Recently completed reviews</span>
          <button
            type="button"
            onClick={() => setAuditOpen(true)}
            className="text-[11px] text-zinc-500 hover:text-zinc-900"
          >
            View audit log →
          </button>
        </header>
        <table className="w-full text-sm">
          <tbody>
            {completed.map((row) => (
              <tr
                key={row.id}
                className="border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50/40"
              >
                <td className="px-3 py-2.5">
                  <div className="text-[13px] font-medium text-zinc-900">{row.facility}</div>
                  <div className="text-[11px] text-zinc-500">
                    {row.cycle} · Completed {row.completedOn}
                  </div>
                </td>
                <td className="max-w-md px-3 py-2.5 text-right text-[11px] text-zinc-500">{row.actions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex max-w-2xl items-start gap-2 text-[12px] text-zinc-500">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          As Reviewer you can comment on any field, lock fields once validated, and either mark the review
          complete (forwards to Approver) or send back to the Author with a reason. All actions are recorded
          in the audit log.
        </span>
      </div>

      {auditOpen ? (
        <AuditLogPanel
          entries={workspace.audit}
          assessmentName={active?.name}
          onClose={() => setAuditOpen(false)}
        />
      ) : null}
    </div>
  );
}
