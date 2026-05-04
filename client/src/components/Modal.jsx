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
    default: "border-zinc-200",
    danger: "border-red-200",
    warn: "border-amber-200"
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 backdrop-blur sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl border bg-white shadow-elevated ${toneAccent[tone] || toneAccent.default}`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="space-y-4 px-5 py-5 text-sm text-zinc-700">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
