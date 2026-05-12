import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, Info } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { FACILITIES } from "../../data/operators";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { AuditLogPanel } from "../../features/assessmentWorkspace/modals";
import {
  ASSESSMENT_STATES,
  filterAssessmentsForRole,
  getQueueActionForState
} from "../../features/assessmentWorkspace/assessmentModel";

const STATUS_LABELS = {
  [ASSESSMENT_STATES.DRAFT]: "Not yet submitted",
  [ASSESSMENT_STATES.IN_REVIEW]: "Awaiting Review",
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: "With Approver",
  [ASSESSMENT_STATES.APPROVED]: "Approved"
};

const STATUS_PILL_STYLES = {
  [ASSESSMENT_STATES.IN_REVIEW]: "bg-secondary-50 text-secondary-800",
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: "bg-violet-50 text-violet-800",
  [ASSESSMENT_STATES.APPROVED]: "bg-emerald-50 text-emerald-800",
  [ASSESSMENT_STATES.DRAFT]: "bg-zinc-100 text-zinc-700"
};

function StatusPill({ state }) {
  const label = STATUS_LABELS[state] || state;
  const className = STATUS_PILL_STYLES[state] || STATUS_PILL_STYLES[ASSESSMENT_STATES.DRAFT];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

export function ReviewerDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { session } = useAuth();
  const [auditOpen, setAuditOpen] = useState(false);

  const accessibleFacilityIds = useMemo(
    () => session.facilities.map((facility) => facility.id),
    [session.facilities]
  );

  /* Personal queue: only assessments where this user is the assigned
     Reviewer. Drives every count and row below. */
  const myAssessments = useMemo(
    () =>
      filterAssessmentsForRole(
        {
          actingRole: ROLES.REVIEWER,
          userId: session.user.id,
          accessibleFacilityIds
        },
        Object.values(workspace.assessmentsById)
      ),
    [workspace.assessmentsById, session.user.id, accessibleFacilityIds]
  );

  const queue = useMemo(
    () =>
      myAssessments
        .filter((a) => a.state !== ASSESSMENT_STATES.APPROVED)
        .map((a) => {
          const facility = FACILITIES.find((f) => f.id === a.facilityId);
          const author = workspace.users.find((u) => u.id === a.leadAuthorUserId);
          return {
            id: a.id,
            facility: facility?.name || a.facilityId,
            cycle: `${a.cycle} SRA`,
            author: author?.name || "—",
            submitted: a.submittedAt ? a.submittedAt.slice(0, 10) : "—",
            state: a.state,
            action: getQueueActionForState({ actingRole: ROLES.REVIEWER, state: a.state })
          };
        }),
    [myAssessments, workspace.users]
  );

  const completed = useMemo(
    () =>
      myAssessments
        .filter((a) => a.state === ASSESSMENT_STATES.APPROVED)
        .map((a) => {
          const facility = FACILITIES.find((f) => f.id === a.facilityId);
          return {
            id: a.id,
            facility: facility?.name || a.facilityId,
            cycle: `${a.cycle} SRA`,
            completedOn:
              (a.signatureDates?.reviewer || a.approvedAt || a.lastUpdated || "").slice(0, 10) ||
              "—"
          };
        }),
    [myAssessments]
  );

  const totalAwaiting = myAssessments.filter(
    (a) => a.state === ASSESSMENT_STATES.IN_REVIEW
  ).length;
  const totalUpcoming = myAssessments.filter(
    (a) => a.state === ASSESSMENT_STATES.DRAFT
  ).length;
  const totalCompletedThisYear = completed.filter((row) => {
    const year = (row.completedOn || "").slice(0, 4);
    return year === String(new Date().getFullYear());
  }).length;

  const active = myAssessments.find((a) => a.state === ASSESSMENT_STATES.IN_REVIEW) || null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Reviewer queue</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Assessments where you are the assigned Reviewer. You can preview Drafts and post
            advisory comments; formal review actions unlock once an Author submits.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <Eye size={10} aria-hidden /> Reviewer: {session.user.name}
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Awaiting your review
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalAwaiting}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {totalAwaiting === 1 ? "1 assessment in review" : `${totalAwaiting} assessments in review`}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Upcoming (Drafts)
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalUpcoming}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Preview and leave advisory comments before submission
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Completed this year
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalCompletedThisYear}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Reviews marked complete and forwarded</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700">
          Your queue
        </header>
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-zinc-500">
            No assessments assigned to you yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-white">
              <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 text-left">Facility / Cycle</th>
                <th className="w-32 px-3 py-2 text-left">Author</th>
                <th className="w-32 px-3 py-2 text-left">Submitted</th>
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
                    <StatusPill state={row.state} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${row.id}/sections/1`)}
                      className={`inline-flex items-center gap-1 text-[12px] ${
                        row.action.tone === "primary" ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      {row.action.label} <ArrowRight size={11} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {completed.length > 0 ? (
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
                  <td className="max-w-md px-3 py-2.5 text-right text-[11px] text-zinc-500">
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${row.id}/sections/1`)}
                      className="btn-secondary inline-flex items-center gap-1 text-[12px]"
                    >
                      View <ArrowRight size={11} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

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
