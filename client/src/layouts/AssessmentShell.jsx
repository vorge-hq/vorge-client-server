import { Link, useNavigate } from "react-router-dom";
import { Activity, BookOpen, Check, Download, FileSearch, Layers, Lock, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ROLES } from "../auth/session";
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
  isAssessmentReadOnly,
  isSection6Complete
} from "../features/assessmentWorkspace/assessmentModel";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

// Bound copy — the §Guest RTL battery asserts this verbatim. Do not reword
// without updating docs/test-specs.md §Guest and the G-RTL4 test.
export const GUEST_BANNER_COPY =
  "You're exploring Vorge as a read-only guest — changes aren't saved.";

function SectionRail({
  assessmentId,
  activeSectionId,
  completedSectionIds,
  commentCounts = {},
  errorsBySection = {},
  onOpenAuditFor
}) {
  return (
    <ol aria-label="Assessment sections" className="grid gap-1">
      {SRA_SECTIONS.map((section) => {
        const isComplete = completedSectionIds?.includes(section.id);
        const isActive = section.id === activeSectionId;
        const errorCount = errorsBySection[section.id]?.length || 0;
        const commentCount = commentCounts[section.id] || 0;
        const badgeRoom = (errorCount > 0 ? 1 : 0) + (commentCount > 0 ? 1 : 0);
        const linkRightPadding = badgeRoom === 0 ? "pr-3" : badgeRoom === 1 ? "pr-12" : "pr-20";
        return (
          <li key={section.id} className="relative">
            <Link
              to={`/assessments/${assessmentId}/sections/${section.id}`}
              className={`group flex items-center gap-3 rounded-lg border py-2 pl-3 ${linkRightPadding} text-[13px] transition ${
                isActive
                  ? "border-primary-100 bg-primary-50 text-primary shadow-sm dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-50"
                  : "border-transparent text-text-secondary hover:border-border-default hover:bg-surface-muted"
              }`}
            >
              <span
                className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-surface-raised text-primary ring-1 ring-primary-100 dark:text-primary-50"
                    : isComplete
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {section.id}
                {isComplete ? (
                  <span
                    className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white"
                    aria-hidden="true"
                  >
                    <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="flex-1 leading-snug">{section.label}</span>
            </Link>
            {errorCount > 0 || commentCount > 0 ? (
              <span
                className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1"
                aria-hidden="false"
              >
                {errorCount > 0 ? (
                  <span
                    className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                    title={`${errorCount} validation issue${errorCount === 1 ? "" : "s"} — open the section to review`}
                  >
                    {errorCount}
                  </span>
                ) : null}
                {commentCount > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenAuditFor?.(section.id);
                    }}
                    className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-300 hover:text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600 dark:hover:text-white"
                    title={`${commentCount} comment${commentCount === 1 ? "" : "s"} — open in audit log`}
                    aria-label={`Open ${commentCount} comment${commentCount === 1 ? "" : "s"} for ${section.label} in audit log`}
                  >
                    <Icon name="comment" className="h-3 w-3" />
                    {commentCount}
                  </button>
                ) : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ToolButton({ Icon: ToolIcon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center gap-2 rounded-md border border-border-default bg-surface-raised px-2.5 py-1.5 text-left text-[12px] text-text-secondary transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary dark:hover:bg-primary-900/40"
    >
      <ToolIcon size={12} aria-hidden /> {label}
    </button>
  );
}

export function AssessmentShell({
  assessment,
  activeSectionId,
  onAction,
  onBack,
  onOpenAudit,
  onOpenLibrary,
  onOpenVersions,
  onOpenExport,
  onOpenAuditFor,
  onRecallApprove,
  onRecallDecline,
  commentCounts = {},
  errorsBySection = {},
  children
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { matrix, evaluations } = useWorkspace();

  /* Section 6's completion is auto-derived from evaluations: it's
     "complete" when every in-scope matrix cell has a meaningfully
     filled evaluation. Other sections still use the static
     completedSectionIds from the assessment seed. */
  const section6Complete = isSection6Complete({ matrix, evaluations });
  const baseCompleted = assessment.completedSectionIds || [];
  const derivedCompletedSectionIds = section6Complete
    ? Array.from(new Set([...baseCompleted, 6]))
    : baseCompleted.filter((id) => id !== 6);

  const progress = getSectionProgress(SRA_SECTIONS, derivedCompletedSectionIds);
  const readOnly = isAssessmentReadOnly({ state: assessment.state, actingRole: session.actingRole });
  const advanceBanner = getAdvanceBanner({
    state: assessment.state,
    actingRole: session.actingRole
  });
  const actions = getWorkflowActionsForRole({
    state: assessment.state,
    actingRole: session.actingRole,
    isLeadAuthor: assessment.leadAuthorUserId === session.user.id,
    reviewerState: assessment.reviewerState,
    approverState: assessment.approverState,
    pendingRecall: assessment.pendingRecall
  });
  const pendingRecall = assessment.pendingRecall;
  const isRecallReceiver =
    pendingRecall && pendingRecall.receiverRole === session.actingRole;
  const isRecallRequester =
    pendingRecall && pendingRecall.requesterRole === session.actingRole;

  const facilityLabel = `${session.facility.displayName || session.facility.name} · Cycle ${assessment.cycle}`;
  const sentBack = assessment.sentBack;

  return (
    <section className="grid gap-5">
      <header className="surface-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate("/assessments"))}
            className="focus-ring mb-2 inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text-primary"
          >
            <span aria-hidden="true">←</span> Back to assessments
          </button>
          <p className="section-eyebrow">{facilityLabel}</p>
          <h1 className="mt-1 text-xl font-bold text-text-primary sm:text-2xl">{assessment.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <StateChip state={assessment.state} />
            {readOnly ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-zinc-600">
                <Lock size={12} aria-hidden /> Read-only
              </span>
            ) : null}
            {assessment.locks?.reviewerLockedFields ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-800">
                <Lock size={12} aria-hidden /> {assessment.locks.reviewerLockedFields} reviewer-locked field
                {assessment.locks.reviewerLockedFields === 1 ? "" : "s"}
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

      {session.actingRole === ROLES.GUEST ? (
        <Banner tone="info" title="Read-only guest">
          {GUEST_BANNER_COPY}
        </Banner>
      ) : null}

      {sentBack ? (
        <Banner
          tone={sentBack.kind === "approver-reject" ? "danger" : "warn"}
          title={
            sentBack.kind === "reviewer-to-author"
              ? "Sent back from Reviewer"
              : sentBack.kind === "approver-to-reviewer"
                ? "Sent back from Approver"
                : "Rejected by Approver"
          }
        >
          {sentBack.from} · {sentBack.date} — {sentBack.reason}
        </Banner>
      ) : null}

      {pendingRecall && isRecallReceiver ? (
        <Banner tone="warn" title={`Recall request from ${pendingRecall.requesterRole}`}>
          <p className="text-[12px]">
            <span className="font-semibold">{pendingRecall.requesterName}</span> ·{" "}
            {pendingRecall.createdAt} — {pendingRecall.reason}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRecallApprove}
              className="btn-primary inline-flex items-center gap-1 text-[12px]"
            >
              <Check size={12} aria-hidden /> Approve recall
            </button>
            <button
              type="button"
              onClick={onRecallDecline}
              className="btn-secondary inline-flex items-center gap-1 text-[12px]"
            >
              <X size={12} aria-hidden /> Decline
            </button>
          </div>
        </Banner>
      ) : null}

      {pendingRecall && isRecallRequester ? (
        <Banner tone="info" title="Recall request pending">
          Awaiting decision from the {pendingRecall.receiverRole}. Reason: "{pendingRecall.reason}"
        </Banner>
      ) : null}

      {advanceBanner ? (
        <Banner tone="info" title="Advance read-only">
          {advanceBanner}
        </Banner>
      ) : null}

      <div
        className="rounded-lg border border-border-default bg-surface-muted/80 px-4 py-3 text-sm text-text-secondary"
        role="status"
      >
        <span className="font-semibold text-text-primary">State: {assessment.state}</span>
        <span className="mt-1 block text-[13px] leading-snug text-text-muted">
          {getAssessmentStateBanner(assessment.state)}
        </span>
      </div>

      <section className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="surface-card flex flex-col gap-4 p-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="section-eyebrow">Section progress</p>
              <span className="text-xs font-semibold text-text-secondary">
                {progress.completed}/{progress.total}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>

          <SectionRail
            assessmentId={assessment.id}
            activeSectionId={activeSectionId}
            completedSectionIds={derivedCompletedSectionIds}
            commentCounts={commentCounts}
            errorsBySection={errorsBySection}
            onOpenAuditFor={onOpenAuditFor}
          />

          <div className="border-t border-border-subtle pt-3">
            <p className="section-eyebrow mb-2">Tools</p>
            <div className="grid gap-1.5">
              <ToolButton Icon={BookOpen} label="Library suggestions" onClick={onOpenLibrary} />
              <ToolButton Icon={FileSearch} label="Audit log" onClick={onOpenAudit} />
              <ToolButton Icon={Layers} label="Assessment history" onClick={onOpenVersions} />
              {assessment.permissions?.canExport !== false ? (
                <ToolButton Icon={Download} label="Export document" onClick={onOpenExport} />
              ) : null}
            </div>
          </div>

          <div className="border-t border-border-subtle pt-3 text-[11px] text-text-muted">
            <p className="inline-flex items-center gap-1 font-semibold text-text-muted">
              <Activity size={11} aria-hidden /> Acting as {session.actingRole}
            </p>
            <p className="mt-1">{readOnly ? "You can navigate and view." : "Edits flow into autosave."}</p>
          </div>
        </aside>

        <div className="grid gap-5">{children}</div>
      </section>
    </section>
  );
}
