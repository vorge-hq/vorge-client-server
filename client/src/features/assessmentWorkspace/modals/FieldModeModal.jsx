import { useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  WifiOff,
  X
} from "lucide-react";

const FEATURE_AVAILABILITY = [
  { id: "edit-evals", label: "Edit checked-out evaluations", available: true },
  { id: "comment", label: "Add comments locally (sync on reconnect)", available: true },
  { id: "photos", label: "Capture site photos & attachments", available: true },
  { id: "ai", label: "AI features (drafted summary, anomaly, library)", available: false },
  { id: "approve", label: "Workflow actions (approve, send back, reject)", available: false },
  { id: "hq", label: "HQ executive dashboards", available: false }
];

export function FieldModeModal({ onClose }) {
  const [installState, setInstallState] = useState("idle");

  function startInstall() {
    setInstallState("installing");
    setTimeout(() => setInstallState("done"), 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-900/40">
              <Smartphone size={16} className="text-primary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Field mode</div>
              <div className="text-[11px] text-text-muted">
                Per-section checkout, offline editing, and signed offline auth tokens.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px]">
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <div className="flex items-start gap-2">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Offline auth uses PIN or biometric — never the full password.</p>
                <p className="mt-1 text-[11px]">
                  Vantage issues a server-signed offline token that expires after 1, 3, 5, or 7 days. If the PIN
                  fails too many times, the offline cache is wiped.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold text-text-secondary">Install as PWA</h3>
            <p className="mt-1 text-[11px] text-text-muted">
              Add Vantage to your home screen so the field crew can launch the app offline. Same browser engine,
              dedicated icon.
            </p>
            <button
              type="button"
              onClick={startInstall}
              disabled={installState !== "idle"}
              className="btn-primary mt-2 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {installState === "idle" ? <Download size={13} /> : null}
              {installState === "installing" ? <Loader2 size={13} className="animate-spin" /> : null}
              {installState === "done" ? <CheckCircle2 size={13} /> : null}
              {installState === "idle" ? "Install Vantage" : null}
              {installState === "installing" ? "Installing…" : null}
              {installState === "done" ? "Installed" : null}
            </button>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold text-text-secondary">What works offline</h3>
            <ul className="mt-2 space-y-1.5">
              {FEATURE_AVAILABILITY.map((feature) => (
                <li key={feature.id} className="flex items-center gap-2 text-[12px]">
                  {feature.available ? (
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-700" />
                  ) : (
                    <WifiOff size={13} className="shrink-0 text-text-disabled" />
                  )}
                  <span className={feature.available ? "text-text-secondary" : "text-text-muted line-through"}>
                    {feature.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold text-text-secondary">Sync queue</h3>
            <p className="mt-1 text-[11px] text-text-muted">
              Edits made offline are queued and replayed on reconnect with field-level conflict prevention. The
              audit log records sync events.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border-default bg-surface-muted px-3 py-2 text-[12px] text-text-secondary">
              <RefreshCw size={12} /> 0 changes pending sync
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/40 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
