import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Banner } from "../components/Banner";
import { StateChip } from "../components/Chip";
import { Icon } from "../components/icons";
import {
  SRA_SECTIONS,
  getActionTone,
  getAdvanceBanner,
  getAssessmentStateBanner,
  getSectionProgress,
  getWorkflowActionsForRole,
  isAssessmentReadOnly
} from "../features/assessmentWorkspace/assessmentModel";

function SectionRail({ assessmentId, activeSectionId, completedSectionIds, sectionValidation }) {
  return (
    <ol aria-label="Assessment sections" className="grid gap-1">
      {SRA_SECTIONS.map((section) => {
        const isComplete = completedSectionIds?.includes(section.id);
        const isActive = section.id === activeSectionId;
        const validation = sectionValidation?.[section.id] || {};
        return (
          <li key={section.id}>
            <Link
              to={`/assessments/${assessmentId}/sections/${section.id}`}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive
                  ? "bg-vantage-navy text-white shadow-card"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : isComplete
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {isComplete ? <Icon name="check" className="h-3.5 w-3.5" /> : section.id}
              </span>
              <span className="flex-1 truncate">{section.label}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs">
                {validation.errors ? (
                  <span
                    className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? "bg-red-200/40 text-red-100" : "bg-red-100 text-red-700"
                    }`}
                    title={`${validation.errors} validation issue${validation.errors === 1 ? "" : "s"}`}
                  >
                    {validation.errors}
                  </span>
                ) : null}
                {validation.comments ? (
                  <span
                    className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                    title={`${validation.comments} comment${validation.comments === 1 ? "" : "s"}`}
                  >
                    <Icon name="comment" className="h-3 w-3" />
                    {validation.comments}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function AssessmentShell({
  assessment,
  activeSectionId,
  onAction,
  onBack,
  children
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const progress = getSectionProgress(SRA_SECTIONS, assessment.completedSectionIds);
  const readOnly = isAssessmentReadOnly({ state: assessment.state, actingRole: session.actingRole });
  const advanceBanner = getAdvanceBanner({
    state: assessment.state,
    actingRole: session.actingRole
  });
  const actions = getWorkflowActionsForRole({
    state: assessment.state,
    actingRole: session.actingRole,
    isLeadAuthor: assessment.leadAuthorUserId === session.user.id
  });

  const facilityLabel = `${session.facility.name} · ${session.facility.operator}`;

  return (
    <section className="grid gap-5">
      <header className="surface-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate("/assessments"))}
            className="focus-ring mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <span aria-hidden="true">←</span> Back to assessments
          </button>
          <p className="section-eyebrow">{facilityLabel} · Cycle {assessment.cycle}</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{assessment.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <StateChip state={assessment.state} />
            <span>Version {assessment.version}</span>
            {readOnly ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
                <Icon name="lock" className="h-3.5 w-3.5" /> Read-only
              </span>
            ) : null}
            {assessment.locks?.reviewerLockedFields ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                <Icon name="lock" className="h-3.5 w-3.5" /> {assessment.locks.reviewerLockedFields} reviewer-locked field{assessment.locks.reviewerLockedFields === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction?.(action.id)}
              className={getActionTone(action.tone)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </header>

      {assessment.sendBackBanner ? (
        <Banner
          tone={assessment.sendBackBanner.tone}
          title={assessment.sendBackBanner.title}
          icon={assessment.sendBackBanner.tone === "danger" ? "!" : "↩"}
        >
          {assessment.sendBackBanner.body}
        </Banner>
      ) : null}

      {advanceBanner ? <Banner tone="info" title="Advance read-only">{advanceBanner}</Banner> : null}

      <Banner tone="info" title={`State: ${assessment.state}`}>
        {getAssessmentStateBanner(assessment.state)}
      </Banner>

      <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="surface-card p-4">
          <div className="flex items-center justify-between">
            <p className="section-eyebrow">Section progress</p>
            <span className="text-xs font-semibold text-slate-700">{progress.completed}/{progress.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-vantage-navy" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="mt-4">
            <SectionRail
              assessmentId={assessment.id}
              activeSectionId={activeSectionId}
              completedSectionIds={assessment.completedSectionIds}
              sectionValidation={assessment.sectionValidation}
            />
          </div>
        </aside>

        <div className="grid gap-5">{children}</div>
      </section>
    </section>
  );
}
