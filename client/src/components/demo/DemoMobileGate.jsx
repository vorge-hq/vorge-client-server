import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import {
  DISMISSED_STORAGE_KEY,
  computeInitialDismissed
} from "./computeInitialDismissed";

const HEADING_ID = "demo-mobile-gate-heading";

export function DemoMobileGate({ children }) {
  const [dismissed, setDismissed] = useState(() => computeInitialDismissed());

  useEffect(() => {
    if (dismissed) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismissed]);

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    } catch {
      // Storage unavailable — still hide for this session.
    }
    setDismissed(true);
  }

  if (dismissed) return children;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={HEADING_ID}
      className="flex min-h-screen items-center justify-center bg-surface-sunken p-6"
      style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Shield size={15} strokeWidth={2.5} className="text-warning" aria-hidden />
          </div>
          <div className="font-semibold tracking-tight text-primary">Vorge</div>
          <div className="ml-1 text-xs text-text-muted">SRA Platform</div>
        </div>

        <h1
          id={HEADING_ID}
          className="mb-3 text-[22px] font-semibold tracking-tight text-text-primary"
        >
          Vorge is built for tablet and desktop
        </h1>
        <p className="mb-8 text-sm text-text-secondary">
          This demo is best experienced on a larger screen — the platform is
          designed for analysts working at a desk. You can continue on this
          device, but layout and interactions may not be optimal.
        </p>

        <button
          type="button"
          autoFocus
          onClick={handleDismiss}
          className="btn-primary mt-2 w-full justify-center py-2.5"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
