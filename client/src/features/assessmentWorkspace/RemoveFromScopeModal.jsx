import { useEffect } from "react";

/**
 * Confirmation prompt before unticking a matrix cell that has user
 * data on its evaluation row. Empty stubs untick instantly without
 * this modal; only cells with at least one filled field reach here.
 *
 * Copy explicitly says "data is preserved" so users know the
 * orphan-preserve behavior exists - re-ticking restores their work.
 *
 * Open/close is fully controlled by the parent. `Esc` and overlay
 * click both fire onCancel.
 */
export function RemoveFromScopeModal({ open, label, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onCancel?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Remove from scope"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-5 py-3">
          <div className="text-[14px] font-semibold text-text-primary">
            Remove from scope?
          </div>
          {label ? (
            <div className="mt-0.5 text-[11px] text-text-muted">{label}</div>
          ) : null}
        </div>

        <div className="px-5 py-4 text-[13px] text-text-secondary">
          Your evaluation data is preserved. If you re-tick this cell later, your
          work will be restored.
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/50 px-5 py-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-warn">
            Remove from scope
          </button>
        </div>
      </div>
    </div>
  );
}

export default RemoveFromScopeModal;
