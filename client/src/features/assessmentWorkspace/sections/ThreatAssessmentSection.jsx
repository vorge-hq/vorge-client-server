import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { ASSESSMENT_STATES } from "../assessmentModel";
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

function isThreatComplete(threat) {
  return !!(
    threat.classification?.trim() &&
    threat.history?.trim() &&
    threat.facilityHistory?.trim() &&
    threat.capabilityIntent?.trim() &&
    threat.rating
  );
}

function CompletionDot({ complete }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        complete ? "bg-emerald-500" : "bg-border-strong"
      }`}
      aria-label={complete ? "Complete" : "Incomplete"}
    />
  );
}

function RatingChip({ level }) {
  return <Chip tone={RATING_TONE[level] || "slate"}>{level}</Chip>;
}

function RatingToggle({ value, onChange, disabled }) {
  if (disabled) {
    return <RatingChip level={value} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {RATINGS.map((level) => {
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

function CollapsedThreatRow({ threat, onClick }) {
  const complete = isThreatComplete(threat);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3.5 text-left transition hover:bg-surface-muted last:border-b-0"
    >
      <CompletionDot complete={complete} />
      <span className="min-w-0 shrink-0 text-sm font-medium text-text-primary">
        {threat.classification}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
        {threat.history || <em className="text-text-disabled">No history entered</em>}
      </span>
      <RatingChip level={threat.rating} />
      <ChevronRight size={14} className="shrink-0 text-text-disabled" />
    </button>
  );
}

function ExpandedThreatRow({ threat, onFieldChange, onCollapse, onRemove, readOnly }) {
  return (
    <div className="border-b border-border-subtle bg-surface-muted/60 last:border-b-0">
      <button
        type="button"
        onClick={onCollapse}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-muted"
      >
        <CompletionDot complete={isThreatComplete(threat)} />
        <span className="text-sm font-semibold text-text-primary">{threat.classification}</span>
        <span className="flex-1" />
        <RatingChip level={threat.rating} />
        <ChevronDown size={14} className="shrink-0 text-text-disabled" />
      </button>

      <div className="px-4 pb-5">
        <div className="space-y-1.5">
          <label className="field-label">Threat Classification</label>
          <input
            value={threat.classification || ""}
            onChange={(e) => onFieldChange("classification", e.target.value)}
            disabled={readOnly}
            placeholder="e.g. Terrorism, Organised Crime, Insider Threat"
            className="field-control"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">General History</label>
          <textarea
            value={threat.history || ""}
            onChange={(e) => onFieldChange("history", e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="Describe the general history of this threat type globally or nationally..."
            className="field-control resize-y"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Facility-Specific History</label>
          <textarea
            value={threat.facilityHistory || ""}
            onChange={(e) => onFieldChange("facilityHistory", e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="Any incidents or intelligence relating to this threat at this specific facility..."
            className="field-control resize-y"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Capability & Intent</label>
          <textarea
            value={threat.capabilityIntent || ""}
            onChange={(e) => onFieldChange("capabilityIntent", e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder="Assess the threat actor's capability and intent to target this facility..."
            className="field-control resize-y"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="field-label">Threat Rating</label>
          <RatingToggle
            value={threat.rating}
            onChange={(level) => onFieldChange("rating", level)}
            disabled={readOnly}
          />
        </div>

        {readOnly ? null : (
          <div className="mt-5 flex items-center justify-end border-t border-border-default pt-4">
            <button
              type="button"
              onClick={() => onRemove(threat)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
            >
              <Trash2 size={12} /> Delete threat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreatAssessmentSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const { threats, updateThreat, addThreat, removeThreat } = useWorkspace();
  const [expandedId, setExpandedId] = useState(null);

  const canComment =
    session.actingRole === ROLES.REVIEWER &&
    assessment?.state === ASSESSMENT_STATES.IN_REVIEW;

  const completeCount = threats.filter(isThreatComplete).length;

  function handleField(threat, field, value) {
    updateThreat(threat.id, { [field]: value });
  }

  function handleAdd() {
    const newThreat = buildNewThreat();
    addThreat(newThreat);
    setExpandedId(newThreat.id);
  }

  function handleRemove(threat) {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Remove ${threat.classification}? This will also clear any Section 5 ticks linking assets to this threat.`
      );
      if (!ok) return;
    }
    if (expandedId === threat.id) {
      setExpandedId(null);
    }
    removeThreat(threat.id);
  }

  return (
    <SectionShell
      number={4}
      title="Threat Assessment"
      description="Threat classifications with general history, facility-specific history, capability and intent, and an overall rating."
      actions={
        <>
          {canComment ? (
            <CommentAffordance section="Section 4 — Threat Assessment" sectionId={4} />
          ) : null}
          {readOnly ? null : (
            <button
              type="button"
              onClick={handleAdd}
              className="btn-primary inline-flex items-center gap-1.5"
            >
              <Plus size={13} aria-hidden /> Add threat
            </button>
          )}
        </>
      }
      footer={
        <p className="text-[11px] text-text-muted">
          {threats.length} threats · removing a threat strips dependent Section 5 ticks.
        </p>
      }
    >
      <ValidationSummary errors={errors} />

      {/* Progress summary */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-text-secondary">
          {completeCount}/{threats.length} complete
        </span>
        <div className="flex gap-1">
          {threats.map((threat) => (
            <span
              key={threat.id}
              className={`h-2 w-5 rounded-full ${
                isThreatComplete(threat) ? "bg-emerald-400" : "bg-border-strong"
              }`}
            />
          ))}
        </div>
        {threats.length > 0 && completeCount === threats.length ? (
          <Chip tone="success">All complete</Chip>
        ) : null}
      </div>

      {/* Threat list */}
      <div className="overflow-hidden rounded-lg border border-border-default">
        {threats.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            No threats yet. Click <strong>+ Add threat</strong> to get started.
          </div>
        ) : (
          threats.map((threat) =>
            expandedId === threat.id ? (
              <ExpandedThreatRow
                key={threat.id}
                threat={threat}
                readOnly={readOnly}
                onFieldChange={(field, value) => handleField(threat, field, value)}
                onCollapse={() => setExpandedId(null)}
                onRemove={handleRemove}
              />
            ) : (
              <CollapsedThreatRow
                key={threat.id}
                threat={threat}
                onClick={() => setExpandedId(threat.id)}
              />
            )
          )
        )}
      </div>
    </SectionShell>
  );
}
