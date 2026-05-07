import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { Banner } from "../../../components/Banner";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { detectAssetAnomaly } from "../../../data/assets";
import { useWorkspace } from "../WorkspaceContext";
import { ASSESSMENT_STATES } from "../assessmentModel";
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

function CompletionDot({ complete }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        complete ? "bg-emerald-500" : "bg-zinc-300"
      }`}
      aria-label={complete ? "Complete" : "Incomplete"}
    />
  );
}

function isAssetComplete(asset) {
  return !!(
    asset.type?.trim() &&
    asset.description?.trim() &&
    asset.dependencies?.trim() &&
    asset.consequences?.trim() &&
    asset.criticality
  );
}

function CriticalityToggle({ value, onChange, disabled }) {
  if (disabled) {
    return <CriticalityChip level={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CRITICALITY_LEVELS.map((level) => {
        const isActive = value === level;
        const toneClasses = {
          Low: isActive
            ? "border-emerald-400 bg-emerald-50 text-emerald-800"
            : "border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50/50",
          Medium: isActive
            ? "border-blue-400 bg-blue-50 text-blue-800"
            : "border-zinc-200 text-zinc-600 hover:border-blue-300 hover:bg-blue-50/50",
          High: isActive
            ? "border-amber-400 bg-amber-50 text-amber-900"
            : "border-zinc-200 text-zinc-600 hover:border-amber-300 hover:bg-amber-50/50",
          "Very High": isActive
            ? "border-red-400 bg-red-50 text-red-800"
            : "border-zinc-200 text-zinc-600 hover:border-red-300 hover:bg-red-50/50"
        };

        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${toneClasses[level]}`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

function CollapsedAssetRow({ asset, onClick, readOnly }) {
  const complete = isAssetComplete(asset);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3.5 text-left transition hover:bg-zinc-50 last:border-b-0"
    >
      <CompletionDot complete={complete} />
      <span className="w-20 shrink-0 text-sm font-medium text-zinc-900">{asset.name}</span>
      <Chip tone="slate" className="shrink-0">{asset.type || "—"}</Chip>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
        {asset.description || <em className="text-zinc-400">No description</em>}
      </span>
      <CriticalityChip level={asset.criticality} />
      <ChevronRight size={14} className="shrink-0 text-zinc-400" />
    </button>
  );
}

function ExpandedAssetRow({ asset, onFieldChange, onCollapse, onRemove, readOnly }) {
  const anomaly = detectAssetAnomaly(asset);

  return (
    <div className="border-b border-zinc-100 bg-zinc-50/60 last:border-b-0">
      <button
        type="button"
        onClick={onCollapse}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-100"
      >
        <CompletionDot complete={isAssetComplete(asset)} />
        <span className="text-sm font-semibold text-zinc-900">{asset.name}</span>
        <Chip tone="slate">{asset.type || "—"}</Chip>
        <span className="flex-1" />
        <CriticalityChip level={asset.criticality} />
        <ChevronDown size={14} className="shrink-0 text-zinc-400" />
      </button>

      <div className="px-4 pb-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="field-label">Asset Type</label>
            <input
              value={asset.type || ""}
              onChange={(e) => onFieldChange("type", e.target.value)}
              disabled={readOnly}
              placeholder="e.g. Process Unit, Storage, Control System"
              className="field-control"
            />
          </div>

          <div className="space-y-1.5">
            <label className="field-label">Dependencies</label>
            <input
              value={asset.dependencies || ""}
              onChange={(e) => onFieldChange("dependencies", e.target.value)}
              disabled={readOnly}
              placeholder="Which other assets does this depend on?"
              className="field-control"
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Description</label>
          <textarea
            value={asset.description || ""}
            onChange={(e) => onFieldChange("description", e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="Describe the asset, its function, and physical characteristics..."
            className="field-control resize-y"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Consequences of Loss</label>
          <textarea
            value={asset.consequences || ""}
            onChange={(e) => onFieldChange("consequences", e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="What happens if this asset is compromised or lost?"
            className="field-control resize-y"
          />
          {anomaly ? (
            <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs font-medium text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {anomaly}
            </p>
          ) : null}
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Criticality</label>
          <CriticalityToggle
            value={asset.criticality}
            onChange={(level) => onFieldChange("criticality", level)}
            disabled={readOnly}
          />
        </div>

        {readOnly ? null : (
          <div className="mt-5 flex items-center justify-end border-t border-zinc-200 pt-4">
            <button
              type="button"
              onClick={() => onRemove(asset.id)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
            >
              <Trash2 size={12} /> Delete asset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AssetDisaggregationSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const { assets, updateAsset, addAsset, removeAsset } = useWorkspace();
  const [expandedId, setExpandedId] = useState(null);

  const canComment =
    session.actingRole === ROLES.REVIEWER &&
    assessment?.state === ASSESSMENT_STATES.IN_REVIEW;

  const completeCount = assets.filter(isAssetComplete).length;

  function handleField(assetId, field, value) {
    updateAsset(assetId, { [field]: value });
  }

  function handleAdd() {
    const id = `a${assets.length + 1}-${Date.now()}`;
    addAsset({
      id,
      name: `Asset ${assets.length + 1}`,
      type: "",
      description: "",
      dependencies: "",
      consequences: "",
      criticality: "Medium"
    });
    setExpandedId(id);
  }

  return (
    <SectionShell
      number={3}
      title="Asset Disaggregation"
      description="Master list of assets at the facility. Section 5 cross-reference and Section 6 evaluations derive from this list."
      actions={
        <>
          {canComment ? (
            <CommentAffordance section="Section 3 — Asset Disaggregation" sectionId={3} />
          ) : null}
          {readOnly ? null : (
            <button
              type="button"
              onClick={handleAdd}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={13} aria-hidden /> Add asset
            </button>
          )}
        </>
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

      {/* Progress summary */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-zinc-700">
          {completeCount}/{assets.length} complete
        </span>
        <div className="flex gap-1">
          {assets.map((asset) => (
            <span
              key={asset.id}
              className={`h-2 w-5 rounded-full ${
                isAssetComplete(asset) ? "bg-emerald-400" : "bg-zinc-200"
              }`}
            />
          ))}
        </div>
        {assets.length > 0 && completeCount === assets.length ? (
          <Chip tone="success">All complete</Chip>
        ) : null}
      </div>

      {/* Asset list */}
      <div className="overflow-hidden rounded-lg border border-zinc-200">
        {assets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">
            No assets yet. Click <strong>+ Add asset</strong> to get started.
          </div>
        ) : (
          assets.map((asset) =>
            expandedId === asset.id ? (
              <ExpandedAssetRow
                key={asset.id}
                asset={asset}
                readOnly={readOnly}
                onFieldChange={(field, value) => handleField(asset.id, field, value)}
                onCollapse={() => setExpandedId(null)}
                onRemove={removeAsset}
              />
            ) : (
              <CollapsedAssetRow
                key={asset.id}
                asset={asset}
                readOnly={readOnly}
                onClick={() => setExpandedId(asset.id)}
              />
            )
          )
        )}
      </div>
    </SectionShell>
  );
}
