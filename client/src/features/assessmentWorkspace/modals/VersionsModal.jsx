import { useState } from "react";
import { Check, Eye, Info, Layers, Lock, X } from "lucide-react";
import { useWorkspace } from "../WorkspaceContext";

export function VersionsModal({ onClose }) {
  const { versions } = useWorkspace();
  const [selected, setSelected] = useState([]);

  function toggleSelect(id) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((s) => s !== id);
      if (current.length < 2) return [...current, id];
      return [current[1], id];
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100">
              <Layers size={16} className="text-zinc-700" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Version history</div>
              <div className="text-[11px] text-zinc-500">
                Asset Site 1 — all approved versions and the current draft.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {versions.map((version) => {
              const isSelected = selected.includes(version.id);
              const isApproved = version.status === "Approved";
              return (
                <button
                  key={version.id}
                  onClick={() => toggleSelect(version.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors"
                  style={
                    isSelected
                      ? { borderColor: "#1E3A5F", background: "#EFF4FB" }
                      : { borderColor: "#E4E4E7", background: "transparent" }
                  }
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-start gap-3">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded"
                        style={
                          isSelected
                            ? { border: "2px solid #1E3A5F", background: "#1E3A5F" }
                            : { border: "2px solid #D4D4D8", background: "transparent" }
                        }
                      >
                        {isSelected ? <Check size={10} style={{ color: "#FFFFFF" }} strokeWidth={3} /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-zinc-900">{version.label}</span>
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
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          {version.date} · {version.author}
                        </div>
                        <div className="mt-1 text-[11px] leading-snug text-zinc-600">
                          {version.notes}
                        </div>
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-zinc-500 hover:text-zinc-900"
                      aria-hidden
                    >
                      <Eye size={13} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] text-zinc-500">
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>
              Select two versions to compare side-by-side with field-level change highlighting. Versions are
              immutable once approved.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/40 px-5 py-3">
          <div className="text-[11px] text-zinc-500">
            {selected.length === 0 ? "Select up to two versions to compare" : null}
            {selected.length === 1 ? "Select one more version to compare" : null}
            {selected.length === 2 ? `Comparing ${selected.join(" vs ")}` : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
            <button
              type="button"
              disabled={selected.length !== 2}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
            >
              Compare side-by-side
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
