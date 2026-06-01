import { Eye, Info, Layers, Lock, X } from "lucide-react";
import { useWorkspace } from "../WorkspaceContext";

export function VersionsModal({ onClose }) {
  const { versions } = useWorkspace();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted">
              <Layers size={16} className="text-text-secondary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Assessment history</div>
              <div className="text-[11px] text-text-muted">
                Eko Petrochemical Hub — current draft and prior approved cycles.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {versions.map((version) => {
              const isApproved = version.status === "Approved";
              return (
                <button
                  key={version.id}
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Available with server backend"
                  className="w-full rounded-lg border border-border-default bg-transparent p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-start gap-3">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-border-strong bg-transparent"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-text-primary">{version.label}</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isApproved
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {isApproved ? <Lock size={9} aria-hidden /> : null}
                            {version.status}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-text-muted">
                          {version.date} · {version.author}
                        </div>
                        <div className="mt-1 text-[11px] leading-snug text-text-muted">
                          {version.notes}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-text-muted hover:text-text-primary"
                      aria-hidden
                    >
                      <Eye size={13} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] text-text-muted">
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>Approved cycles are immutable.</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-muted/40 px-5 py-3">
          <div className="text-[11px] text-text-muted">
            Side-by-side comparison: available with server backend.
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button
              type="button"
              disabled
              title="Available with server backend"
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Compare side-by-side
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
