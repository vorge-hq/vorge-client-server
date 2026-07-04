import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { Banner } from "../../../components/Banner";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { getCommentPermission } from "../assessmentModel";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

export function ExecutiveSummarySection({ assessment, readOnly, onOpenAIDraft, errors }) {
  const { session } = useAuth();
  const { saveSectionText, showToast } = useWorkspace();
  const [text, setText] = useState(assessment?.executiveSummary || "");
  const [conflict, setConflict] = useState(null);
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  /* Persist on blur (Sections 1/2/8 are the free-text narrative sections). In
     prod this fires PUT /sections/1 with the lockVersion the client read; a lost
     race surfaces the reload affordance. In demo it updates fixtures only. */
  const handleBlur = async () => {
    if (readOnly || text === (assessment?.executiveSummary || "")) return;
    const result = await saveSectionText({
      assessmentId: assessment.id,
      sectionNumber: 1,
      contentText: text,
      lockVersion: assessment?.lockVersion ?? 1,
      actingRole: session.actingRole
    });
    if (result?.conflict) {
      setConflict(result.error);
    } else if (result?.error) {
      showToast(result.error, { tone: "error" });
    } else {
      setConflict(null);
      showToast("Executive Summary saved.");
    }
  };

  return (
    <SectionShell
      number={1}
      title="Executive Summary"
      description="A short, board-ready summary of methodology, scope, residual risk distribution, and key proposed mitigations."
      actions={
        <>
          {commentKind ? (
            <CommentAffordance
              section="Section 1 — Executive Summary"
              sectionId={1}
              kind={commentKind}
            />
          ) : null}
          {readOnly ? null : (
            <button
              type="button"
              onClick={onOpenAIDraft}
              className="btn-accent inline-flex items-center gap-1.5"
            >
              <Sparkles size={12} aria-hidden /> Draft with AI
            </button>
          )}
        </>
      }
      footer={
        <p className="text-[11px] text-zinc-500">
          {wordCount} words · auto-saved · audit log captures every edit.
        </p>
      }
    >
      <ValidationSummary errors={errors} />
      <Banner tone="info" title="AI drafting available">
        Sections 1 and 8 support AI-drafted summaries. Drafts are clearly labelled and audit-logged before
        becoming final.
      </Banner>

      {conflict ? (
        <Banner tone="error" title="Changes not saved">
          {conflict}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline font-medium">
            Reload
          </button>
        </Banner>
      ) : null}

      {readOnly ? (
        <article className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700 whitespace-pre-line">
          {text || "Author has not yet drafted the Executive Summary."}
        </article>
      ) : (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={handleBlur}
          rows={12}
          className="field-control resize-y text-sm leading-relaxed"
          placeholder="Draft an executive summary aligned to the methodology used."
        />
      )}
    </SectionShell>
  );
}
