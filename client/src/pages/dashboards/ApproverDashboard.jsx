import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { FACILITIES } from "../../data/operators";
import { isDemoEnabled } from "../../auth/demoFlag";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { AuditLogPanel } from "../../features/assessmentWorkspace/modals";
import {
  ASSESSMENT_STATES,
  filterAssessmentsForRole,
  getQueueActionForState
} from "../../features/assessmentWorkspace/assessmentModel";

const STATUS_LABELS = {
  [ASSESSMENT_STATES.DRAFT]: "With Author",
  [ASSESSMENT_STATES.IN_REVIEW]: "With Reviewer",
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: "Awaiting Approval",
  [ASSESSMENT_STATES.APPROVED]: "Approved"
};

const STATUS_PILL_STYLES = {
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: "bg-secondary-50 text-secondary-800",
  [ASSESSMENT_STATES.IN_REVIEW]: "bg-blue-50 text-blue-800",
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

const APPROVED_NOTES = {
  "ass-1-2025": "Approved with note: maritime rating to be revisited next cycle",
  "ass-2-2025": "Approved",
  "ass-3-2025": "Sent back to Reviewer once · then approved"
};

export function ApproverDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { session } = useAuth();
  const [auditOpen, setAuditOpen] = useState(false);

  const accessibleFacilityIds = useMemo(
    () => session.facilities.map((facility) => facility.id),
    [session.facilities]
  );

  /* Personal queue: only assessments where this user is the assigned
     Approver. */
  const myAssessments = useMemo(
    () =>
      filterAssessmentsForRole(
        {
          actingRole: ROLES.APPROVER,
          userId: session.user.id,
          accessibleFacilityIds
        },
        Object.values(workspace.assessmentsById),
        { serverScoped: !isDemoEnabled() }
      ),
    [workspace.assessmentsById, session.user.id, accessibleFacilityIds]
  );

  const queue = useMemo(
    () =>
      myAssessments
        .filter((a) => a.state !== ASSESSMENT_STATES.APPROVED)
        .map((a) => {
          const facility = FACILITIES.find((f) => f.id === a.facilityId);
          const reviewer = workspace.users.find((u) => u.id === a.reviewerUserId);
          const reviewedOn =
            a.signatureDates?.reviewer ||
            (a.state === ASSESSMENT_STATES.AWAITING_APPROVAL ? "Just now" : "—");
          return {
            id: a.id,
            facility: facility?.name || a.facilityId,
            cycle: `${a.cycle} SRA`,
            reviewer: reviewer?.name || "—",
            reviewedOn,
            state: a.state,
            action: getQueueActionForState({ actingRole: ROLES.APPROVER, state: a.state })
          };
        }),
    [myAssessments, workspace.users]
  );

  const recentlyApproved = useMemo(
    () =>
      myAssessments
        .filter((a) => a.state === ASSESSMENT_STATES.APPROVED)
        .map((a) => {
          const facility = FACILITIES.find((f) => f.id === a.facilityId);
          return {
            id: a.id,
            facility: facility?.name || a.facilityId,
            cycle: `${a.cycle} SRA`,
            approvedOn:
              (a.signatureDates?.approver || a.approvedAt || "").slice(0, 10) || "—",
            note:
              a.signatureDates?.approverNote || APPROVED_NOTES[a.id] || "Approved"
          };
        }),
    [myAssessments]
  );

  const totalAwaiting = myAssessments.filter(
    (a) => a.state === ASSESSMENT_STATES.AWAITING_APPROVAL
  ).length;
  const totalUpcoming = myAssessments.filter(
    (a) =>
      a.state === ASSESSMENT_STATES.DRAFT || a.state === ASSESSMENT_STATES.IN_REVIEW
  ).length;
  const approvedThisYear = recentlyApproved.filter((row) => {
    const year = (row.approvedOn || "").slice(0, 4);
    return year === String(new Date().getFullYear());
  }).length;

  const active =
    myAssessments.find((a) => a.state === ASSESSMENT_STATES.AWAITING_APPROVAL) || null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Approver queue</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Assessments where you are the assigned Approver. You can preview Drafts and In-Review work
            with advisory comments; formal approval actions unlock once the Reviewer marks complete.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <CheckCircle2 size={10} aria-hidden /> Approver: {session.user.name}
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
            Upcoming
          </div>
          <div className="text-2xl font-semibold tabular-nums">{totalUpcoming}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Drafts and in-review work coming your way
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Approved this year
          </div>
          <div className="text-2xl font-semibold tabular-nums">{approvedThisYear}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Final sign-offs by you</div>
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

      {recentlyApproved.length > 0 ? (
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
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${row.id}/sections/1`)}
                      className="btn-secondary inline-flex items-center gap-1 text-[12px]"
                      title="Open approved assessment (read-only)"
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
