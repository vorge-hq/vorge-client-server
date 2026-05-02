import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardHeader } from "../../components/Card";
import { StateChip } from "../../components/Chip";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";
import { ASSESSMENTS } from "../../data/assessments";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";

export function ReviewerDashboard() {
  const { session } = useAuth();
  const queue = ASSESSMENTS.filter((a) => a.reviewerUserId === session.user.id);
  const inReview = queue.filter((a) => a.state === ASSESSMENT_STATES.IN_REVIEW);
  const drafts = queue.filter((a) => a.state === ASSESSMENT_STATES.DRAFT);

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow={`${session.facility.name} · Reviewer`}
        title="Review queue"
        description="Validate Author submissions, comment, lock fields, then mark complete or send back."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Awaiting review" value={inReview.length} tone="info" />
        <KpiCard label="Drafts (advance read)" value={drafts.length} hint="Author has not yet submitted" />
        <KpiCard label="Locked fields" value={2} hint="Field-level locks held by you" />
      </section>

      <Card>
        <CardHeader
          eyebrow="Queue"
          title="Assessments awaiting your review"
          description="Comments and field locks unlock once the Author submits."
        />
        <ul className="mt-4 grid gap-3">
          {queue.length === 0 ? (
            <li className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
              No assessments are currently assigned to you.
            </li>
          ) : (
            queue.map((assessment) => (
              <li
                key={assessment.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{assessment.name}</p>
                  <p className="text-xs text-slate-500">
                    Updated {new Date(assessment.lastUpdated).toLocaleString()} · Cycle {assessment.cycle}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateChip state={assessment.state} />
                  <Link
                    to={`/assessments/${assessment.id}/sections/1`}
                    className="btn-primary"
                  >
                    {assessment.state === ASSESSMENT_STATES.IN_REVIEW ? "Open review" : "Read in advance"}
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      </Card>
    </section>
  );
}
