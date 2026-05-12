import { useState } from "react";
import { Info, X } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { FACILITIES } from "../../../data/operators";
import { useOperatorMemory } from "../../../hooks/useOperatorMemory";

export function NewAssessmentModal({ onClose, onCreate }) {
  const { session } = useAuth();
  const operatorId = session?.facility?.operatorId || "op-a";
  const { suggestionsFor, recordFacility } = useOperatorMemory(operatorId);

  /* Build a deduped list of facility names: governance facilities first
     (the configured list this user has access to), then any free-text
     names the operator has entered before that aren't already in the
     governance list. */
  const knownFacilityNames = FACILITIES.map((f) => f.name);
  const rememberedNames = suggestionsFor("name").filter(
    (name) => !knownFacilityNames.includes(name)
  );
  const allFacilityOptions = [...knownFacilityNames, ...rememberedNames];

  const [facility, setFacility] = useState(allFacilityOptions[0] || "Lagos Refinery");
  const [source, setSource] = useState("clone");

  function handleCreate() {
    /* Persist the chosen facility name so it shows up next time as a
       suggestion. Only the name is recorded here; full Section 2
       details are recorded when the user fills them in. */
    if (facility?.trim()) {
      recordFacility({ name: facility.trim() });
    }
    onCreate?.({ facility, source });
  }

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
            <label className="mb-1.5 block text-[11px] font-medium text-text-secondary" htmlFor="new-assessment-facility">
              Facility
            </label>
            <input
              id="new-assessment-facility"
              type="text"
              list="new-assessment-facility-options"
              autoComplete="off"
              value={facility}
              onChange={(event) => setFacility(event.target.value)}
              placeholder="Pick from the list or type a new facility name"
              className="field-control text-[13px]"
            />
            <datalist id="new-assessment-facility-options">
              {allFacilityOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {rememberedNames.length > 0 ? (
              <p className="mt-1 text-[10px] text-text-muted">
                {rememberedNames.length} previously-entered{" "}
                {rememberedNames.length === 1 ? "facility" : "facilities"} available as suggestions.
              </p>
            ) : null}
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
          <button type="button" onClick={handleCreate} className="btn-primary">
            Create and open
          </button>
        </div>
      </div>
    </div>
  );
}
