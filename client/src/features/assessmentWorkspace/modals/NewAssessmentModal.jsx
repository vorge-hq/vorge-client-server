import { useState } from "react";
import { Info, X } from "lucide-react";
import { FACILITIES } from "../../../data/operators";

export function NewAssessmentModal({ onClose, onCreate }) {
  const [facility, setFacility] = useState(FACILITIES[0]?.name || "Asset Site 1");
  const [source, setSource] = useState("clone");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">New assessment</div>
            <div className="text-[11px] text-zinc-500">
              Start a new SRA cycle for a facility you have access to.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-700">Facility</label>
            <select
              value={facility}
              onChange={(event) => setFacility(event.target.value)}
              className="field-control text-[13px]"
            >
              {FACILITIES.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-700">Starting point</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSource("clone")}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  source === "clone"
                    ? "border-[#1E3A5F] bg-[#EFF4FB]"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      source === "clone" ? "border-[#1E3A5F]" : "border-zinc-300"
                    }`}
                  >
                    {source === "clone" ? (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1E3A5F" }} />
                    ) : null}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">Clone last year's assessment</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      Carries forward all assets, threats, evaluations, and mitigations from the 2025 cycle for editing.
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSource("blank")}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  source === "blank"
                    ? "border-[#1E3A5F] bg-[#EFF4FB]"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      source === "blank" ? "border-[#1E3A5F]" : "border-zinc-300"
                    }`}
                  >
                    {source === "blank" ? (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#1E3A5F" }} />
                    ) : null}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">Start blank</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      Empty 9-section template. Use for a brand-new facility.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-zinc-500">
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>
              You'll be assigned as Author. The Reviewer and Approver are inherited from the facility's
              governance settings.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate?.({ facility, source })}
            className="btn-primary"
            style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
          >
            Create and open
          </button>
        </div>
      </div>
    </div>
  );
}
