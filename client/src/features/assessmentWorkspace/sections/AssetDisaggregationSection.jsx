import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Banner } from "../../../components/Banner";
import { Chip } from "../../../components/Chip";
import { detectAssetAnomaly } from "../../../data/assets";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const CRITICALITY_LEVELS = ["Low", "Medium", "High", "Very High"];

const CRITICALITY_TONE = {
  Low: "success",
  Medium: "info",
  High: "warn",
  "Very High": "danger"
};

function CriticalityChip({ level }) {
  return <Chip tone={CRITICALITY_TONE[level] || "slate"}>{level}</Chip>;
}

export function AssetDisaggregationSection({ readOnly, errors }) {
  const { assets, updateAsset, addAsset, removeAsset } = useWorkspace();

  function handleField(assetId, field, value) {
    updateAsset(assetId, { [field]: value });
  }

  function handleAdd() {
    const id = `a${assets.length + 1}-${Date.now()}`;
    addAsset({
      id,
      name: `Asset ${assets.length + 1}`,
      type: "—",
      description: "",
      dependencies: "",
      consequences: "",
      criticality: "Medium"
    });
  }

  return (
    <SectionShell
      number={3}
      title="Asset Disaggregation"
      description="Master list of assets at the facility. Section 5 cross-reference and Section 6 evaluations derive from this list."
      actions={
        readOnly ? null : (
          <button type="button" onClick={handleAdd} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={13} aria-hidden /> Add asset
          </button>
        )
      }
      footer={
        <p className="text-[11px] text-zinc-500">
          {assets.length} assets · changes flow into Section 5 matrix and Section 6 evaluations.
        </p>
      }
    >
      <ValidationSummary errors={errors} />
      <Banner tone="info" title="Single source of truth">
        Edits here update the asset list across Sections 5, 6, and 7. Deleting an asset will warn before
        removing dependent evaluations and mitigations.
      </Banner>

      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 lg:block">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Dependencies</th>
              <th className="px-3 py-2">Consequences</th>
              <th className="px-3 py-2">Criticality</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {assets.map((asset) => {
              const anomaly = detectAssetAnomaly(asset);
              return (
                <tr key={asset.id} className="align-top">
                  <td className="px-3 py-2 font-medium text-zinc-900">{asset.name}</td>
                  <td className="px-3 py-2">
                    <input
                      value={asset.type || ""}
                      onChange={(event) => handleField(asset.id, "type", event.target.value)}
                      disabled={readOnly}
                      className="field-control text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={asset.description || ""}
                      onChange={(event) => handleField(asset.id, "description", event.target.value)}
                      disabled={readOnly}
                      rows={2}
                      className="field-control text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={asset.dependencies || ""}
                      onChange={(event) => handleField(asset.id, "dependencies", event.target.value)}
                      disabled={readOnly}
                      className="field-control text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={asset.consequences || ""}
                      onChange={(event) => handleField(asset.id, "consequences", event.target.value)}
                      disabled={readOnly}
                      rows={2}
                      className="field-control text-[12px]"
                    />
                    {anomaly ? (
                      <p className="mt-1 inline-flex items-start gap-1 text-[10px] font-medium text-amber-800">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {anomaly}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {readOnly ? (
                      <CriticalityChip level={asset.criticality} />
                    ) : (
                      <select
                        value={asset.criticality}
                        onChange={(event) => handleField(asset.id, "criticality", event.target.value)}
                        className="field-control text-[12px]"
                      >
                        {CRITICALITY_LEVELS.map((level) => (
                          <option key={level}>{level}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {readOnly ? null : (
                      <button
                        type="button"
                        onClick={() => removeAsset(asset.id)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Delete ${asset.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {assets.map((asset) => {
          const anomaly = detectAssetAnomaly(asset);
          return (
            <article key={asset.id} className="rounded-lg border border-zinc-200 p-3 text-[13px]">
              <header className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-zinc-900">{asset.name}</h3>
                  <p className="text-[11px] text-zinc-500">{asset.type}</p>
                </div>
                <CriticalityChip level={asset.criticality} />
              </header>
              <p className="text-zinc-700">{asset.description}</p>
              <p className="mt-2 text-[11px] text-zinc-500">
                <span className="font-semibold text-zinc-700">Dependencies:</span> {asset.dependencies || "—"}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                <span className="font-semibold text-zinc-700">Consequences:</span> {asset.consequences || "—"}
              </p>
              {anomaly ? (
                <p className="mt-2 inline-flex items-start gap-1 text-[11px] font-medium text-amber-800">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {anomaly}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}
