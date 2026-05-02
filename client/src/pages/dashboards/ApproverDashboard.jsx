import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardHeader } from "../../components/Card";
import { StateChip } from "../../components/Chip";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";
import { ASSESSMENTS } from "../../data/assessments";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";

export function ApproverDashboard() {
  const { session } = useAuth();
  const queue = ASSESSMENTS.filter((a) => a.approverUserId === session.user.id);
  const awaiting = queue.filter((a) => a.state === ASSESSMENT_STATES.AWAITING_APPROVAL);
  const approved = queue.filter((a) => a.state === ASSESSMENT_STATES.APPROVED);

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow={`${session.facility.name} · Approver`}
        title="Approval queue"
        description="Approve, send back to Reviewer, or reject to Draft. Decisions are immutable in the audit trail."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Awaiting approval" value={awaiting.length} tone={awaiting.length ? "info" : "default"} />
        <KpiCard label="Approved this cycle" value={approved.length} tone="success" />
        <KpiCard label="Send-backs (last 90d)" value={1} hint="Audit-tracked decisions" />
      </section>

      <Card>
        <CardHeader
          eyebrow="Decisions required"
          title="Awaiting your decision"
          description="Use the decision panel inside each assessment to approve, send back, or reject."
        />
        {awaiting.length === 0 ? (
          <p className="mt-4 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            No assessments currently waiting on your approval.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {awaiting.map((assessment) => (
              <li
                key={assessment.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{assessment.name}</p>
                  <p className="text-xs text-slate-500">
                    Submitted {assessment.submittedAt ? new Date(assessment.submittedAt).toLocaleDateString() : "—"} · Reviewer complete
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateChip state={assessment.state} />
                  <Link to={`/assessments/${assessment.id}/sections/1`} className="btn-primary">
                    Open decision panel
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader eyebrow="Recent" title="Recently approved" />
        <ul className="mt-4 grid gap-3">
          {approved.map((assessment) => (
            <li
              key={assessment.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
            >
              <div>
                <p className="font-semibold text-slate-900">{assessment.name}</p>
                <p className="text-xs text-slate-500">
                  Approved {assessment.approvedAt ? new Date(assessment.approvedAt).toLocaleDateString() : "—"}
                </p>
              </div>
              <Link to={`/assessments/${assessment.id}/sections/1`} className="btn-secondary">
                Open
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
