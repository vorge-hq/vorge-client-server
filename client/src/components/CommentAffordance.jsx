import { useState } from "react";
import { Check, Eye, MessageSquare } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { COMMENT_KINDS } from "../features/assessmentWorkspace/assessmentModel";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

const STATE_PREVIEW_LABEL = {
  Draft: "Draft preview",
  "In Review": "In Review preview",
  "Awaiting Approval": "Awaiting Approval preview",
  Approved: "Approved record"
};

export function CommentAffordance({ section, sectionId, anchor, mini = false, kind = COMMENT_KINDS.FORMAL }) {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [posted, setPosted] = useState(false);

  const isAdvisory = kind === COMMENT_KINDS.ADVISORY;

  function handlePost() {
    if (!comment.trim()) return;
    workspace.addComment?.({
      section,
      sectionId,
      anchor,
      comment: comment.trim(),
      kind,
      actor: { name: session.user.name, role: session.actingRole }
    });
    setPosted(true);
    setTimeout(() => {
      setOpen(false);
      setComment("");
      setPosted(false);
    }, 1500);
  }

  if (mini) {
    return (
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
          isAdvisory
            ? "text-text-muted hover:bg-surface-muted hover:text-text-secondary"
            : "text-text-muted hover:bg-primary-50 hover:text-primary dark:hover:bg-primary-900/40"
        }`}
        title={`${isAdvisory ? "Advisory comment" : "Comment"} on ${anchor || section}`}
      >
        {isAdvisory ? <Eye size={10} aria-hidden /> : <MessageSquare size={10} aria-hidden />}
        {isAdvisory ? "Advisory" : "Comment"}
      </button>
    );
  }

  /* Static preview-state label so users see the role/state context
     without it changing on every keystroke. Falls back gracefully if
     the workspace doesn't expose an active assessment. */
  const activeAssessment =
    workspace.assessmentsById?.[workspace.activeAssessmentId];
  const stateLabel =
    STATE_PREVIEW_LABEL[activeAssessment?.state] || "preview";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
          isAdvisory
            ? "border border-border-default bg-surface-muted text-text-secondary hover:bg-surface-sunken"
            : "border border-primary-100 bg-primary-50 text-primary hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/40 dark:hover:bg-primary-900/60"
        }`}
      >
        {isAdvisory ? <Eye size={11} aria-hidden /> : <MessageSquare size={11} aria-hidden />}
        {isAdvisory ? "Add advisory comment" : "Add comment"}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close comment"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
            <div className="border-b border-zinc-100 bg-zinc-50/50 px-3 py-2">
              <div className="text-[11px] font-medium text-zinc-700">
                {isAdvisory
                  ? `Advisory comment - ${session.actingRole} (${stateLabel})`
                  : "Reviewer comment"}
              </div>
              <div className="text-[10px] text-zinc-500">{anchor || section}</div>
              {isAdvisory ? (
                <div className="mt-1 text-[10px] leading-snug text-zinc-500">
                  Advisory only - does not block workflow. Visible to the assessment team in the audit log.
                </div>
              ) : null}
            </div>
            {posted ? (
              <div className="flex items-center gap-1.5 px-3 py-4 text-[12px] text-emerald-700">
                <Check size={12} aria-hidden /> Comment posted to audit log.
              </div>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={
                    isAdvisory
                      ? "Observation, question, or heads-up for the assessment team..."
                      : "Question, observation, or concern..."
                  }
                  rows={3}
                  className="w-full resize-none border-b border-zinc-100 px-3 py-2 text-[12px] focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2 bg-zinc-50/40 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setComment("");
                    }}
                    className="text-[11px] text-zinc-600 hover:text-zinc-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePost}
                    disabled={!comment.trim()}
                    className={`rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${
                      isAdvisory
                        ? "bg-text-secondary text-white hover:bg-text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    Post {isAdvisory ? "advisory" : "comment"}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
