import { Plus, Trash2 } from "lucide-react";
import { Chip } from "../../../components/Chip";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const RATINGS = ["Low", "Medium", "High", "Very High"];
const RATING_TONE = {
  Low: "success",
  Medium: "info",
  High: "warn",
  "Very High": "danger"
};

function makeThreatId() {
  return `t-custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function buildNewThreat() {
  return {
    id: makeThreatId(),
    classification: "New threat",
    short: "New",
    history: "",
    facilityHistory: "",
    capabilityIntent: "",
    rating: "Medium"
  };
}

export function ThreatAssessmentSection({ readOnly, errors }) {
  const { threats, updateThreat, addThreat, removeThreat } = useWorkspace();

  function handleField(threat, field, value) {
    updateThreat(threat.id, { [field]: value });
  }

  function handleAdd() {
    addThreat(buildNewThreat());
  }

  function handleRemove(threat) {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Remove ${threat.classification}? This will also clear any Section 5 ticks linking assets to this threat.`
      );
      if (!ok) return;
    }
    removeThreat(threat.id);
  }

  return (
    <SectionShell
      number={4}
      title="Threat Assessment"
      description="Threat classifications with general history, facility-specific history, capability and intent, and an overall rating."
      actions={
        readOnly ? null : (
          <button
            type="button"
            onClick={handleAdd}
            className="btn-primary inline-flex items-center gap-1.5"
            style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
          >
            <Plus size={13} aria-hidden /> Add threat
          </button>
        )
      }
      footer={
        <p className="text-[11px] text-zinc-500">
          {threats.length} threats · removing a threat strips dependent Section 5 ticks.
        </p>
      }
    >
      <ValidationSummary errors={errors} />
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 lg:block">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-44 px-3 py-2">Threat</th>
              <th className="px-3 py-2">General history</th>
              <th className="px-3 py-2">Facility-specific history</th>
              <th className="px-3 py-2">Capability & intent</th>
              <th className="w-32 px-3 py-2">Rating</th>
              <th className="w-12 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {threats.map((threat) => (
              <tr key={threat.id} className="align-top">
                <td className="px-3 py-2">
                  {readOnly ? (
                    <span className="font-medium text-zinc-900">{threat.classification}</span>
                  ) : (
                    <input
                      value={threat.classification || ""}
                      onChange={(event) => handleField(threat, "classification", event.target.value)}
                      className="field-control text-[12px] font-medium"
                      aria-label="Threat classification"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  <textarea
                    value={threat.history || ""}
                    onChange={(event) => handleField(threat, "history", event.target.value)}
                    disabled={readOnly}
                    rows={2}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-2">
                  <textarea
                    value={threat.facilityHistory || ""}
                    onChange={(event) => handleField(threat, "facilityHistory", event.target.value)}
                    disabled={readOnly}
                    rows={2}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-2">
                  <textarea
                    value={threat.capabilityIntent || ""}
                    onChange={(event) => handleField(threat, "capabilityIntent", event.target.value)}
                    disabled={readOnly}
                    rows={2}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-2">
                  {readOnly ? (
                    <Chip tone={RATING_TONE[threat.rating]}>{threat.rating}</Chip>
                  ) : (
                    <select
                      value={threat.rating || "Medium"}
                      onChange={(event) => handleField(threat, "rating", event.target.value)}
                      className="field-control text-[12px]"
                    >
                      {RATINGS.map((rating) => (
                        <option key={rating}>{rating}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => handleRemove(threat)}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete ${threat.classification}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {threats.map((threat) => (
          <article key={threat.id} className="rounded-lg border border-zinc-200 p-3 text-[13px]">
            <header className="mb-2 flex items-start justify-between gap-2">
              {readOnly ? (
                <h3 className="font-semibold text-zinc-900">{threat.classification}</h3>
              ) : (
                <input
                  value={threat.classification || ""}
                  onChange={(event) => handleField(threat, "classification", event.target.value)}
                  className="field-control flex-1 text-[13px] font-medium"
                  aria-label="Threat classification"
                />
              )}
              <div className="flex items-center gap-1.5">
                {readOnly ? (
                  <Chip tone={RATING_TONE[threat.rating]}>{threat.rating}</Chip>
                ) : (
                  <select
                    value={threat.rating || "Medium"}
                    onChange={(event) => handleField(threat, "rating", event.target.value)}
                    className="field-control text-[12px] sm:w-32"
                  >
                    {RATINGS.map((rating) => (
                      <option key={rating}>{rating}</option>
                    ))}
                  </select>
                )}
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => handleRemove(threat)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-700"
                    aria-label={`Delete ${threat.classification}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </header>
            <textarea
              value={threat.history || ""}
              onChange={(event) => handleField(threat, "history", event.target.value)}
              disabled={readOnly}
              rows={2}
              className="field-control mt-1 text-[12px]"
              aria-label={`${threat.classification} general history`}
            />
            <textarea
              value={threat.facilityHistory || ""}
              onChange={(event) => handleField(threat, "facilityHistory", event.target.value)}
              disabled={readOnly}
              rows={2}
              className="field-control mt-1 text-[12px]"
              aria-label={`${threat.classification} facility history`}
            />
            <textarea
              value={threat.capabilityIntent || ""}
              onChange={(event) => handleField(threat, "capabilityIntent", event.target.value)}
              disabled={readOnly}
              rows={2}
              className="field-control mt-1 text-[12px]"
              aria-label={`${threat.classification} capability and intent`}
            />
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
