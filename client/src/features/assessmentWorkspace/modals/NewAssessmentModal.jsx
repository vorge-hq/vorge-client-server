import { useState } from "react";
import { Info, X } from "lucide-react";
import { FACILITIES } from "../../../data/operators";

export function NewAssessmentModal({ onClose, onCreate }) {
  const [facility, setFacility] = useState(FACILITIES[0]?.name || "Asset Site 1");
  const [source, setSource] = useState("clone");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">New assessment</div>
            <div className="text-[11px] text-text-muted">
              Start a new SRA cycle for a facility you have access to.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-text-secondary">Facility</label>
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
            <label className="mb-1.5 block text-[11px] font-medium text-text-secondary">Starting point</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSource("clone")}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  source === "clone"
                    ? "border-primary bg-primary-50 dark:bg-primary-900/40"
                    : "border-border-default hover:border-border-strong"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      source === "clone" ? "border-primary" : "border-border-strong"
                    }`}
                  >
                    {source === "clone" ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">Clone last year's assessment</div>
                    <div className="mt-0.5 text-[11px] text-text-muted">
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
                    ? "border-primary bg-primary-50 dark:bg-primary-900/40"
                    : "border-border-default hover:border-border-strong"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      source === "blank" ? "border-primary" : "border-border-strong"
                    }`}
                  >
                    {source === "blank" ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">Start blank</div>
                    <div className="mt-0.5 text-[11px] text-text-muted">
                      Empty 9-section template. Use for a brand-new facility.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-text-muted">
            <Info size={11} className="mt-0.5 shrink-0" />
            <span>
              You'll be assigned as Author. The Reviewer and Approver are inherited from the facility's
              governance settings.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onCreate?.({ facility, source })}
            className="btn-primary"
          >
            Create and open
          </button>
        </div>
      </div>
    </div>
  );
}
