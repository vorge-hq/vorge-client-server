import { useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../features/assessmentWorkspace/WorkspaceContext";

export function CommentAffordance({ section, sectionId, anchor, mini = false }) {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [posted, setPosted] = useState(false);

  function handlePost() {
    if (!comment.trim()) return;
    workspace.addComment?.({
      section,
      sectionId,
      anchor,
      comment: comment.trim(),
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
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-primary-50 hover:text-primary dark:hover:bg-primary-900/40"
        title={`Comment on ${anchor || section}`}
      >
        <MessageSquare size={10} aria-hidden />
        Comment
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-[11px] text-primary transition-colors hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/40 dark:hover:bg-primary-900/60"
      >
        <MessageSquare size={11} aria-hidden />
        Add comment
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
              <div className="text-[11px] font-medium text-zinc-700">Reviewer comment</div>
              <div className="text-[10px] text-zinc-500">{anchor || section}</div>
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
                  placeholder="Question, observation, or concern..."
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
                    className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Post comment
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
