import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { Banner } from "../../../components/Banner";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { getCommentPermission } from "../assessmentModel";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

export function ConclusionSection({ assessment, readOnly, onOpenAIDraft, errors }) {
  const { session } = useAuth();
  const [text, setText] = useState(assessment?.conclusion || "");
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  return (
    <SectionShell
      number={8}
      title="Conclusion"
      description="Closing position on residual risk, mitigation acceptance, and sign-off readiness."
      actions={
        <>
          {commentKind ? (
            <CommentAffordance
              section="Section 8 — Conclusion"
              sectionId={8}
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
      footer={<p className="text-[11px] text-zinc-500">{wordCount} words · auto-saved.</p>}
    >
      <ValidationSummary errors={errors} />
      <Banner tone="info" title="Closing statement">
        Approver attention focuses on this section; keep findings and proposed mitigations clearly summarised.
      </Banner>

      {readOnly ? (
        <article className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700 whitespace-pre-line">
          {text || "Author has not yet drafted the Conclusion."}
        </article>
      ) : (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          className="field-control resize-y text-sm leading-relaxed"
          placeholder="Conclude the assessment and recommend approval conditions."
        />
      )}
    </SectionShell>
  );
}
