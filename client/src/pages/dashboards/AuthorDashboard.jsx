import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Banner } from "../../components/Banner";
import { Card, CardHeader } from "../../components/Card";
import { StateChip } from "../../components/Chip";
import { Icon } from "../../components/icons";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";
import { ASSESSMENTS } from "../../data/assessments";
import { MITIGATIONS } from "../../data/mitigations";
import { ASSESSMENT_STATES } from "../../features/assessmentWorkspace/assessmentModel";

export function AuthorDashboard() {
  const { session } = useAuth();
  const myAssessments = ASSESSMENTS.filter(
    (assessment) =>
      assessment.facilityId === session.facility.id ||
      assessment.leadAuthorUserId === session.user.id
  );
  const drafts = myAssessments.filter((a) => a.state === ASSESSMENT_STATES.DRAFT);
  const inReview = myAssessments.filter((a) => a.state === ASSESSMENT_STATES.IN_REVIEW);
  const recent = myAssessments
    .slice()
    .sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1))
    .slice(0, 4);

  const overdueMitigations = MITIGATIONS.filter(
    (mitigation) =>
      mitigation.status !== "Done" &&
      new Date(mitigation.targetDate) < new Date()
  );

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow={`${session.facility.name} · ${session.facility.operator}`}
        title={`Welcome back, ${session.user.name.split(" ")[0]}`}
        description="Pick up where you left off, resolve outstanding feedback, and prepare assessments for submission."
        actions={
          <>
            <Link to="/assessments" className="btn-secondary">
              View all assessments
            </Link>
            <button type="button" className="btn-primary">
              <Icon name="plus" className="h-4 w-4" /> New assessment
            </button>
          </>
        }
      />

      {drafts.length === 0 && inReview.length === 0 ? (
        <Banner tone="info" title="No active assessments">
          Start a new SRA or clone last cycle's assessment for this facility.
        </Banner>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active drafts" value={drafts.length} hint="Editable by you" />
        <KpiCard label="In review" value={inReview.length} hint="Awaiting reviewer action" tone="info" />
        <KpiCard label="Overdue mitigations" value={overdueMitigations.length} tone={overdueMitigations.length ? "warn" : "default"} />
        <KpiCard label="Open AI flags" value={1} hint="From anomaly detection" />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              eyebrow="Workspace"
              title="Recent assessments"
              description="Resume a draft, address review comments, or open a previously approved assessment."
              action={
                <Link to="/assessments" className="btn-secondary">
                  See all
                </Link>
              }
            />
            <ul className="mt-4 grid gap-3">
              {recent.map((assessment) => (
                <li
                  key={assessment.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{assessment.name}</p>
                    <p className="text-xs text-slate-500">
                      Updated {new Date(assessment.lastUpdated).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StateChip state={assessment.state} />
                    <Link
                      to={`/assessments/${assessment.id}/sections/1`}
                      className="btn-secondary"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="flex flex-col gap-4">
          <CardHeader
            eyebrow="Tasks"
            title="Today"
            description="Inline reminders generated from comments, anomaly flags, and submission validation."
          />
          <ul className="grid gap-3 text-sm">
            <li className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-semibold">Resolve send-back on Section 8</p>
              <p className="mt-1 text-xs">Reviewer requested clarification on Conclusion paragraph 2.</p>
              <Link
                to="/assessments/ass-bonny-2026/sections/8"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
              >
                Open Section 8 <Icon name="chevron-right" className="h-3 w-3" />
              </Link>
            </li>
            <li className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900">
              <p className="font-semibold">2 anomaly flags awaiting acknowledgement</p>
              <p className="mt-1 text-xs">
                Severity vs criticality mismatch on the Coral FPSO assessment.
              </p>
              <Link to="/assessments/ass-coral-2026/sections/6" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline">
                Open Section 6 <Icon name="chevron-right" className="h-3 w-3" />
              </Link>
            </li>
          </ul>
        </Card>
      </section>
    </section>
  );
}
