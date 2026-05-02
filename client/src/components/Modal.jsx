import { useEffect } from "react";

export function Modal({ open, title, children, onClose, footer, tone = "default" }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onKey(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const toneAccent = {
    default: "border-slate-200",
    danger: "border-red-200",
    warn: "border-amber-200"
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl border bg-white shadow-elevated ${toneAccent[tone] || toneAccent.default}`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="space-y-4 px-5 py-5 text-sm text-slate-700">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
