import { useState } from "react";
import { Download, FileText, X, AlertTriangle } from "lucide-react";
import { EXPORT_FORMATS } from "../../../api/assessmentApi";
import { ASSESSMENT_STATES } from "../assessmentModel";

// Document export chooser (§16). Offers the standard SRA template in Word or PDF.
// onExport(formatId) returns { ok } | { error } | { demo }; the modal shows a busy
// state per format, surfaces an inline error, and closes on success/demo.
export function ExportModal({ assessment, onExport, onClose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const isApproved = assessment?.state === ASSESSMENT_STATES.APPROVED;

  async function choose(formatId) {
    setBusy(formatId);
    setError(null);
    const result = await onExport(formatId);
    setBusy(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onClose(); // ok or demo — parent shows the toast
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">Export document</div>
            <div className="text-[11px] text-text-muted">
              Download this assessment as the standard SRA template.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-[13px]">
          {!isApproved ? (
            <div className="flex items-start gap-2 rounded-lg border bg-[var(--semantic-warning-bg)] px-3 py-2 text-[var(--semantic-warning-text)] border-[var(--semantic-warning-text)]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                This assessment is not yet approved — the export is watermarked as a non-final copy.
              </span>
            </div>
          ) : null}

          <div className="grid gap-2">
            {EXPORT_FORMATS.map((format) => (
              <button
                key={format.id}
                type="button"
                disabled={busy !== null}
                onClick={() => choose(format.id)}
                className="focus-ring flex items-center gap-3 rounded-lg border border-border-default px-3 py-2.5 text-left hover:bg-surface-muted disabled:opacity-60"
              >
                {format.id === "pdf" ? (
                  <FileText size={16} className="shrink-0 text-text-muted" />
                ) : (
                  <Download size={16} className="shrink-0 text-text-muted" />
                )}
                <span className="font-semibold text-text-primary">{format.label}</span>
                {busy === format.id ? (
                  <span className="ml-auto text-[11px] text-text-muted">Preparing…</span>
                ) : null}
              </button>
            ))}
          </div>

          {error ? (
            <p className="text-[12px] font-medium text-[var(--semantic-danger-text)]">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
