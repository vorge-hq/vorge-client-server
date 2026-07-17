// P4 · O5 — presentational AI-draft modal (§9.1). The section component owns the
// generate flow (it holds the editor's text state) and passes the draft + loading
// state in through the prod↔demo seam; this modal just previews the draft, offers
// Regenerate, and hands the accepted text back via onAccept. The section's
// onAccept persists immediately (blur-save is not enough after the modal closes).
// The AI original is already retained server-side in the audit at generate time.
import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

export function AIDraftModal({ draft = "", loading = false, target = "Section 1 — Executive Summary", onRegenerate, onClose, onAccept }) {
  const [text, setText] = useState(draft);

  // Keep the editable preview in sync when a (re)generated draft arrives.
  useEffect(() => {
    setText(draft);
  }, [draft]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-900/40">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">AI drafted summary</div>
              <div className="text-[11px] text-text-muted">{target}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-muted px-4 py-6 text-[13px] text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Drafting from the assessment's structured data…
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-lg border bg-[var(--semantic-info-bg)] px-3 py-2 text-[11px] text-[var(--semantic-info-text)] border-[var(--semantic-info-text)]">
                AI-generated, requires human review — clearly labelled and audit-logged. Review and edit before saving.
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label="AI draft"
                rows={14}
                className="field-control resize-y text-[13px] leading-relaxed"
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {onRegenerate ? (
            <button type="button" onClick={onRegenerate} disabled={loading} className="btn-secondary disabled:opacity-60">
              Regenerate
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              // Section onAccept closes the modal after persist; fall back to
              // onClose when a caller only wants the text (tests / older seams).
              if (onAccept) onAccept(text);
              else onClose?.();
            }}
            disabled={loading}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Accept draft
          </button>
        </div>
      </div>
    </div>
  );
}
