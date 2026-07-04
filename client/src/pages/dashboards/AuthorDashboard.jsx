import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  FileSearch,
  FileText,
  Lock,
  MessageSquare,
  Plus,
  Smartphone,
  Sparkles,
  Tag,
  Wand2
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ROLES } from "../../auth/session";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { calculateRisk } from "../../features/assessmentWorkspace/riskMatrix";
import {
  AIDraftModal,
  AuditLogPanel,
  FieldModeModal,
  NewAssessmentModal
} from "../../features/assessmentWorkspace/modals";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";
import {
  filterAssessmentsForRole,
  getQueueActionForState
} from "../../features/assessmentWorkspace/assessmentModel";

function StatCard({ label, value, sub, tone = "default" }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-raised px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div
          className={`text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-700" : ""}`}
        >
          {value}
        </div>
      </div>
      <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function CapabilityRow({ icon: ItemIcon, label, state = "active", tooltip, onClick }) {
  const [hover, setHover] = useState(false);
  const isAddon = state === "addon";
  const isActive = state === "active";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors ${
          isAddon ? "cursor-help hover:bg-amber-50/40" : "hover:bg-surface-muted"
        }`}
      >
        <div className={`flex items-center gap-2 ${isAddon ? "text-text-muted" : "text-text-secondary"}`}>
          <span className={isAddon ? "text-text-disabled" : "text-text-muted"}>
            <ItemIcon size={11} />
          </span>
          {label}
        </div>
        {isActive ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            On
          </span>
        ) : null}
        {isAddon ? (
          <span className="inline-flex items-center gap-1 rounded bg-secondary-50 px-1.5 py-0.5 text-[10px] font-medium text-secondary-800">
            <Lock size={9} aria-hidden /> Add-on
          </span>
        ) : null}
      </button>

      {isAddon && hover && tooltip ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md bg-zinc-900 p-3 text-[11px] leading-relaxed text-white shadow-xl">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <Lock size={9} aria-hidden /> Paid add-on
          </div>
          <div className="mb-2.5 text-white/90">{tooltip}</div>
          <div className="border-t border-white/10 pt-2 font-medium text-amber-300">
            Enquire to enable →
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    Draft: "bg-zinc-100 text-zinc-700",
    "In Review": "bg-blue-50 text-blue-800",
    "Awaiting Approval": "bg-violet-50 text-violet-800",
    Approved: "bg-emerald-50 text-emerald-800"
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || styles.Draft}`}
    >
      {status === "Approved" ? <Lock size={9} aria-hidden /> : null}
      {status}
    </span>
  );
}

export function AuthorDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [newAssessmentOpen, setNewAssessmentOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [fieldModeOpen, setFieldModeOpen] = useState(false);

  const accessibleFacilityIds = useMemo(
    () => session.facilities.map((facility) => facility.id),
    [session.facilities]
  );

  /* Personal queue: assessments where this user is the Lead Author. */
  const assessments = useMemo(
    () =>
      filterAssessmentsForRole(
        {
          actingRole: ROLES.AUTHOR,
          userId: session.user.id,
          accessibleFacilityIds
        },
        Object.values(workspace.assessmentsById),
        { serverScoped: !isDemoEnabled() }
      ),
    [workspace.assessmentsById, session.user.id, accessibleFacilityIds]
  );
  const active = workspace.assessmentsById[workspace.activeAssessmentId];

  const totalEvals = workspace.evaluations.length;
  const highRisks = workspace.evaluations.filter((e) => {
    const r = calculateRisk(e.consequenceR1, e.likelihoodR1);
    return r && (r.band === "High" || r.band === "Very High");
  }).length;

  const visibleAssessments = assessments.slice(0, 4);
  const recent = workspace.audit.slice(0, 5);

  return (
    <div className="grid gap-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Assessments</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            All SRAs assigned to you across facilities you have access to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFieldModeOpen(true)}
            className="btn-secondary inline-flex items-center gap-1.5"
          >
            <Smartphone size={13} aria-hidden /> Field app
          </button>
          <button
            type="button"
            onClick={() => setAiDraftOpen(true)}
            className="btn-accent inline-flex items-center gap-1.5"
          >
            <Sparkles size={13} aria-hidden /> AI-draft summary
          </button>
          <button
            type="button"
            onClick={() => setNewAssessmentOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} aria-hidden /> New assessment
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active assessments" value={visibleAssessments.length} sub="Across your facilities" />
        <StatCard label="Assets in catalogue" value={workspace.assets.length} sub="Section 3" />
        <StatCard
          label="Evaluations"
          value={totalEvals}
          sub={`${highRisks} High or Very High`}
          tone={highRisks > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Sections complete"
          value={`${active?.completedSectionIds?.length || 0}/9`}
          sub="Active SRA"
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface-muted/60 px-4 py-2.5">
          <p className="text-[13px] font-medium text-text-secondary">All assessments</p>
          <p className="text-[11px] text-text-muted">Showing {visibleAssessments.length} of {assessments.length}</p>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Completion</th>
              <th className="px-4 py-2 text-left font-medium">Reviewer</th>
              <th className="px-4 py-2 text-left font-medium">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleAssessments.map((assessment) => {
              const completion = Math.round(
                ((assessment.completedSectionIds?.length || 0) / 9) * 100
              );
              const isActive = assessment.id === workspace.activeAssessmentId;
              const reviewer = workspace.users.find(
                (u) => u.id === assessment.reviewerUserId
              );
              const action = getQueueActionForState({
                actingRole: ROLES.AUTHOR,
                state: assessment.state
              });
              const landingSection = isDemoEnabled() ? 1 : 2;
              const openAssessment = () =>
                navigate(`/assessments/${assessment.id}/sections/${landingSection}`);
              const handleRowKeyDown = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openAssessment();
                }
              };
              return (
                <tr
                  key={assessment.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${assessment.name}`}
                  onClick={openAssessment}
                  onKeyDown={handleRowKeyDown}
                  className="group cursor-pointer border-t border-border-subtle hover:bg-surface-muted/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-border-focus"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-text-disabled" />
                      <span className="font-medium">{assessment.name}</span>
                      {isActive ? (
                        <span className="inline-flex items-center rounded-full bg-secondary-50 px-2 py-0.5 text-[10px] font-semibold text-secondary-800">
                          You · Active
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={assessment.state} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-text-secondary"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      <span className="w-8 text-[11px] tabular-nums text-text-muted">{completion}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{reviewer?.name || "—"}</td>
                  <td className="px-4 py-3 text-[13px] text-text-muted">
                    {new Date(assessment.lastUpdated).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openAssessment();
                      }}
                      className={`text-[13px] font-medium hover:underline ${
                        action.tone === "primary" ? "text-text-primary" : "text-text-muted"
                      }`}
                    >
                      {action.label} →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border-default bg-surface-raised p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-text-secondary">Recent activity</h3>
            <button
              type="button"
              onClick={() => setAuditOpen(true)}
              className="text-[11px] text-text-muted hover:text-text-primary"
            >
              View audit log →
            </button>
          </div>
          <div className="space-y-2.5 text-[13px]">
            {recent.map((row) => (
              <div key={row.id} className="flex items-center gap-3 text-text-muted">
                <div className="w-16 shrink-0 text-[11px] tabular-nums text-text-disabled">
                  {(row.timestamp || row.ts || "").slice(11, 16) || "—"}
                </div>
                <div className="flex-1">
                  <span className="font-medium text-text-primary">{row.user}</span>{" "}
                  <span className="text-text-muted">{row.action}</span>{" "}
                  {row.detail ? (
                    <span className="text-text-secondary">— {row.detail}</span>
                  ) : null}
                </div>
                {row.action === "flag" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    <AlertTriangle size={10} aria-hidden /> AI flag
                  </span>
                ) : null}
                {row.action === "comment" ? (
                  <MessageSquare size={12} className="text-text-disabled" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border-default bg-surface-raised p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary-50 dark:bg-primary-900/40">
              <Sparkles size={11} className="text-primary" />
            </div>
            <h3 className="text-[13px] font-semibold text-text-secondary">Active capabilities</h3>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            Capabilities available for this facility. AI output is advisory and requires human review.
          </p>

          <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-text-disabled">
            Active
          </div>
          <div className="mb-3 space-y-1 text-[12px]">
            <CapabilityRow icon={FileSearch} label="Semantic library search" state="active" />
            <CapabilityRow icon={Wand2} label="AI-drafted summaries" state="active" />
            <CapabilityRow icon={Tag} label="Smart tagging of scenarios" state="active" />
          </div>

          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-text-disabled">
            Additional capabilities
            <span className="text-zinc-300">·</span>
            <span className="font-normal normal-case tracking-normal text-text-disabled">enquire to enable</span>
          </div>
          <div className="space-y-1 text-[12px]">
            <CapabilityRow
              icon={() => <Sparkles size={11} />}
              label="Real-time anomaly detection"
              state="addon"
              tooltip="Inline warnings catch errors as analysts work — rating math that doesn't add up, scenarios that don't match the threat type, criticality vs. consequence mismatches."
            />
            <CapabilityRow
              icon={() => <Sparkles size={11} />}
              label="Cross-facility consistency flagging"
              state="addon"
              tooltip="Nightly comparison of risk ratings across your facility portfolio. Statistical outliers flagged on the HQ Executive dashboard."
            />
            <CapabilityRow
              icon={() => <Smartphone size={11} />}
              label="Offline field mode"
              state="addon"
              tooltip="Genuine offline editing for analysts at offshore platforms, remote terminals, low-connectivity sites."
              onClick={() => setFieldModeOpen(true)}
            />
          </div>

          <Link
            to={`/assessments/${ACTIVE_ASSESSMENT_ID}/sections/6`}
            className="mt-4 inline-block text-[12px] font-medium text-primary hover:text-primary-600"
          >
            See evaluation drill-down →
          </Link>
        </div>
      </section>

      {aiDraftOpen ? (
        <AIDraftModal
          assets={workspace.assets}
          evaluations={workspace.evaluations}
          onClose={() => setAiDraftOpen(false)}
        />
      ) : null}
      {newAssessmentOpen ? (
        <NewAssessmentModal
          onClose={() => setNewAssessmentOpen(false)}
          onCreate={() => {
            setNewAssessmentOpen(false);
            workspace.showToast("New assessment created");
          }}
        />
      ) : null}
      {auditOpen ? (
        <AuditLogPanel
          entries={workspace.audit}
          assessmentName={active?.name}
          onClose={() => setAuditOpen(false)}
        />
      ) : null}
      {fieldModeOpen ? <FieldModeModal onClose={() => setFieldModeOpen(false)} /> : null}
    </div>
  );
}
