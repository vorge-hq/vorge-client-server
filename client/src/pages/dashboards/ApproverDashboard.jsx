import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { AuditLogPanel } from "../../features/assessmentWorkspace/modals";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";

function StatusPill({ status }) {
  const styles = {
    "Awaiting Approval": "bg-secondary-50 text-secondary-800",
    "Not yet reviewed": "bg-zinc-100 text-zinc-700"
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || styles["Not yet reviewed"]}`}
    >
      {status}
    </span>
  );
}

export function ApproverDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [auditOpen, setAuditOpen] = useState(false);
  const active = workspace.assessmentsById[ACTIVE_ASSESSMENT_ID];
  const isAwaitingApproval = active?.state === ASSESSMENT_STATES.AWAITING_APPROVAL;

  const queue = [
    {
      id: "a1",
      facility: "Operator A — Lagos Refinery",
      cycle: "2026 SRA",
      reviewer: "A. Reviewer",
      reviewedOn: isAwaitingApproval ? "Just now" : "—",
      status: isAwaitingApproval ? "Awaiting Approval" : "Not yet reviewed",
      isCurrent: true
    },
    {
      id: "a2",
      facility: "Operator A — Bonny Terminal",
      cycle: "2026 SRA",
      reviewer: "A. Reviewer",
      reviewedOn: "4 days ago",
      status: "Awaiting Approval",
      isCurrent: false
    }
  ];

  const approvedAssessments = Object.values(workspace.assessmentsById).filter(
    (a) => a.state === ASSESSMENT_STATES.APPROVED
  );

  const APPROVED_NOTES = {
    "ass-1-2025": "Approved with note: maritime rating to be revisited next cycle",
    "ass-2-2025": "Approved",
    "ass-3-2025": "Sent back to Reviewer once · then approved"
  };

  const recentlyApproved = approvedAssessments.length
    ? approvedAssessments.map((assessment) => ({
        id: assessment.id,
        facility: assessment.name,
        cycle: `${assessment.cycle} SRA`,
        approvedOn:
          (assessment.signatureDates?.approver || assessment.approvedAt || "").slice(0, 10) ||
          "—",
        note:
          assessment.signatureDates?.approverNote ||
          APPROVED_NOTES[assessment.id] ||
          "Approved"
      }))
    : [
        {
          id: "ap1",
          facility: "Operator A — Lagos Refinery",
          cycle: "2025 SRA",
          approvedOn: "2025-09-12",
          note: "Approved with note: maritime rating to be revisited next cycle"
        }
      ];

  const totalAwaiting = queue.filter((q) => q.status === "Awaiting Approval").length;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Approver queue</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Reviewed assessments awaiting your sign-off. You can approve, send back to Reviewer, or reject —
            with comments at decision points.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <CheckCircle2 size={10} aria-hidden /> Approver: M. Approver
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Awaiting your approval
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalAwaiting}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Reviewed and forwarded to you</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Approved this quarter
          </div>
          <div className="text-2xl font-semibold tabular-nums">3</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Final sign-offs by you</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Sent back this quarter
          </div>
          <div className="text-2xl font-semibold tabular-nums">1</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Returned to Reviewer with notes</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700">
          Awaiting your approval
        </header>
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-white">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 text-left">Facility / Cycle</th>
              <th className="w-32 px-3 py-2 text-left">Reviewer</th>
              <th className="w-32 px-3 py-2 text-left">Reviewed on</th>
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
                <td className="px-3 py-2.5 text-[12px] text-zinc-700">{row.reviewer}</td>
                <td className="px-3 py-2.5 text-[12px] text-zinc-700">{row.reviewedOn}</td>
                <td className="px-3 py-2.5">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.isCurrent && row.status === "Awaiting Approval" ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${ACTIVE_ASSESSMENT_ID}/sections/1`)}
                      className="btn-primary inline-flex items-center gap-1 text-[12px]"
                    >
                      Open <ArrowRight size={11} aria-hidden />
                    </button>
                  ) : (
                    <span className="text-[11px] italic text-zinc-400">Other approver</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
          <span className="text-[13px] font-medium text-zinc-700">Recently approved</span>
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
            {recentlyApproved.map((row) => (
              <tr
                key={row.id}
                className="border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50/40"
              >
                <td className="px-3 py-2.5">
                  <div className="text-[13px] font-medium text-zinc-900">{row.facility}</div>
                  <div className="text-[11px] text-zinc-500">
                    {row.cycle} · Approved {row.approvedOn}
                  </div>
                </td>
                <td className="max-w-md px-3 py-2.5 text-[11px] text-zinc-500">{row.note}</td>
                <td className="w-24 px-3 py-2.5 text-right">
                  {workspace.assessmentsById[row.id] ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${row.id}/sections/1`)}
                      className="btn-secondary inline-flex items-center gap-1 text-[12px]"
                      title="Open approved assessment (read-only)"
                    >
                      Open <ArrowRight size={11} aria-hidden />
                    </button>
                  ) : (
                    <span className="text-[11px] italic text-zinc-400">Archived</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="flex max-w-2xl items-start gap-2 text-[12px] text-zinc-500">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          As Approver you read the full assessment but cannot edit content. At decision points you may add
          a comment — mandatory for Send back and Reject, optional for Approve. All decisions are recorded in
          the audit log.
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
