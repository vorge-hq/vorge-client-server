import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, Info } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { isDemoEnabled } from "../../auth/demoFlag";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { ASSESSMENT_STATES, filterAssessmentsForRole } from "../../features/assessmentWorkspace/assessmentModel";

// Read-only guest landing. Lists the assessments the SERVER scoped to this guest
// (prod hydration → workspace.assessmentsById), with a View link into each.
// Deliberately no create / submit / queue-action affordances — a guest produces
// nothing (server-enforced; see docs/plans/guest-viewer-execution-plan.md).

const STATUS_LABELS = {
  [ASSESSMENT_STATES.DRAFT]: "Draft",
  [ASSESSMENT_STATES.IN_REVIEW]: "In Review",
  [ASSESSMENT_STATES.AWAITING_APPROVAL]: "Awaiting Approval",
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

export function GuestDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { session } = useAuth();

  const accessibleFacilityIds = useMemo(
    () => session.facilities.map((facility) => facility.id),
    [session.facilities]
  );

  const facilityName = (facilityId) =>
    session.facilities.find((f) => f.id === facilityId)?.name || facilityId;

  // serverScoped in prod: the list API already returned exactly the guest's
  // in-scope assessments — the facility guard is the only client-side narrowing.
  const rows = useMemo(
    () =>
      filterAssessmentsForRole(
        { actingRole: ROLES.GUEST, userId: session.user.id, accessibleFacilityIds },
        Object.values(workspace.assessmentsById),
        { serverScoped: !isDemoEnabled() }
      ),
    [workspace.assessmentsById, session.user.id, accessibleFacilityIds]
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Explore assessments</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            You&apos;re signed in as a read-only guest. Open any assessment to explore it — nothing
            you do here is saved.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
          <Eye size={10} aria-hidden /> Guest: {session.user.name}
        </span>
      </header>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5 text-[13px] font-medium text-zinc-700">
          Assessments
        </header>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-zinc-500">
            No assessments are available to view.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-white">
              <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 text-left">Facility / Cycle</th>
                <th className="w-36 px-3 py-2 text-left">Status</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-zinc-100 hover:bg-zinc-50/40">
                  <td className="px-3 py-2.5">
                    <div className="text-[13px] font-medium text-zinc-900">
                      {facilityName(a.facilityId)}
                    </div>
                    <div className="text-[11px] text-zinc-500">{a.cycle ? `${a.cycle} SRA` : a.name}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill state={a.state} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/assessments/${a.id}/sections/1`)}
                      className="btn-secondary inline-flex items-center gap-1 text-[12px]"
                    >
                      View <ArrowRight size={11} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex max-w-2xl items-start gap-2 text-[12px] text-zinc-500">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Guest access is read-only. You can open assessments and browse every section, but you
          cannot create, edit, submit, export, or comment — those actions are reserved for the
          assessment team.
        </span>
      </div>
    </div>
  );
}
