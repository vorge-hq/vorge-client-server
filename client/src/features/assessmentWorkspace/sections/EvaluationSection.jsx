import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileSearch } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { similarity } from "../../../data/library";
import { AssetThreatMatrix, MatrixLegend } from "../AssetThreatMatrix";
import { RemoveFromScopeModal } from "../RemoveFromScopeModal";
import { useWorkspace } from "../WorkspaceContext";
import {
  ASSESSMENT_STATES,
  evaluationHasAnyData,
  getCommentPermission,
  getEvaluationStatus,
  isEvaluationComplete
} from "../assessmentModel";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const STATUS_DOT_CLASS = {
  missing: "border-border-strong bg-border-strong",
  "in-progress": "border-severity-medium-fill bg-severity-medium-fill",
  complete: "border-severity-low-fill bg-severity-low-fill"
};

function ListStatusDot({ state }) {
  const className = STATUS_DOT_CLASS[state] || STATUS_DOT_CLASS.missing;
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full border ${className}`}
    />
  );
}

const CONSEQUENCE_LEVELS = [
  { v: 0, label: "No effect" },
  { v: 1, label: "Slight" },
  { v: 2, label: "Minor" },
  { v: 3, label: "Moderate" },
  { v: 4, label: "Major" },
  { v: 5, label: "Massive" }
];

const LIKELIHOOD_LEVELS = [
  { v: 1, label: "Very Low", desc: "Never heard of in industry" },
  { v: 2, label: "Low", desc: "Heard of in industry" },
  { v: 3, label: "Medium", desc: "Has happened in the org." },
  { v: 4, label: "High", desc: "Has happened at the location" },
  { v: 5, label: "Very High", desc: ">1×/year at this location" }
];

const BAND_TOKENS = {
  low: {
    chip: "bg-severity-low-bg text-severity-low-text border-severity-low-fill",
    fill: "bg-severity-low-fill"
  },
  medium: {
    chip: "bg-severity-medium-bg text-severity-medium-text border-severity-medium-fill",
    fill: "bg-severity-medium-fill"
  },
  high: {
    chip: "bg-severity-high-bg text-severity-high-text border-severity-high-fill",
    fill: "bg-severity-high-fill"
  },
  "very-high": {
    chip: "bg-severity-very-high-bg text-severity-very-high-text border-severity-very-high-fill",
    fill: "bg-severity-very-high-fill"
  }
};

function calcRisk(consequence, likelihood) {
  if (!consequence || !likelihood) return null;
  const score = consequence * likelihood;
  if (score <= 4) return { band: "Low", score, color: "low" };
  if (score <= 9) return { band: "Medium", score, color: "medium" };
  if (score <= 15) return { band: "High", score, color: "high" };
  return { band: "Very High", score, color: "very-high" };
}

function RiskChip({ rating, size = "sm" }) {
  if (!rating) {
    return <span className="text-xs text-text-disabled">—</span>;
  }
  const tokens = BAND_TOKENS[rating.color];
  const dim = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium ${tokens.chip} ${dim}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tokens.fill}`} />
      {rating.band}
      <span className="font-normal opacity-60 tabular-nums">· {rating.score}</span>
    </span>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function MiniMatrix({ consequence, likelihood }) {
  const rows = [5, 4, 3, 2, 1];
  const cols = [1, 2, 3, 4, 5];
  return (
    <div className="inline-block">
      <div className="flex">
        <div className="w-3" aria-hidden />
        <div className="flex flex-1 justify-around text-[8px] font-medium text-text-disabled">
          {cols.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="flex w-3 flex-col justify-around pr-1 text-[8px] font-medium text-text-disabled">
          {rows.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-5 gap-[2px]">
          {rows.flatMap((r) =>
            cols.map((c) => {
              const score = r * c;
              const band =
                score <= 4 ? "low" : score <= 9 ? "medium" : score <= 15 ? "high" : "very-high";
              const tokens = BAND_TOKENS[band];
              const isActive = consequence === r && likelihood === c;
              return (
                <div
                  key={`${r}-${c}`}
                  className={`relative aspect-square rounded-sm ${tokens.fill}`}
                  style={{
                    opacity: isActive ? 1 : 0.18,
                    outline: isActive ? "2px solid var(--text-primary)" : "none",
                    outlineOffset: isActive ? "1px" : "0"
                  }}
                  title={`Consequence ${r} × Likelihood ${c} = ${score}`}
                >
                  {isActive ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-text-inverse">
                      {score}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[9px] text-text-muted">
        <span>Likelihood →</span>
      </div>
    </div>
  );
}

function RiskBlock({ label, consequence, likelihood, onChange, rating, canEdit = true }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-medium text-text-secondary">{label}</div>
        <RiskChip rating={rating} />
      </div>

      <div className="space-y-2">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase text-text-muted">Consequence</div>
          <select
            value={consequence || 0}
            onChange={(event) => onChange(parseInt(event.target.value, 10), likelihood)}
            disabled={!canEdit}
            className="w-full rounded border border-border-default bg-surface-base px-2 py-1.5 text-[12px] focus:border-border-focus focus:outline-none disabled:cursor-default disabled:bg-surface-muted disabled:text-text-muted"
          >
            <option value={0}>Select severity…</option>
            {CONSEQUENCE_LEVELS.filter((c) => c.v > 0).map((c) => (
              <option key={c.v} value={c.v}>
                {c.v} · {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase text-text-muted">Likelihood</div>
          <select
            value={likelihood || 0}
            onChange={(event) => onChange(consequence, parseInt(event.target.value, 10))}
            disabled={!canEdit}
            className="w-full rounded border border-border-default bg-surface-base px-2 py-1.5 text-[12px] focus:border-border-focus focus:outline-none disabled:cursor-default disabled:bg-surface-muted disabled:text-text-muted"
          >
            <option value={0}>Select likelihood…</option>
            {LIKELIHOOD_LEVELS.map((l) => (
              <option key={l.v} value={l.v}>
                {l.v} · {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <MiniMatrix consequence={consequence || 0} likelihood={likelihood || 0} />
      </div>
    </div>
  );
}

function EvaluationEditor({ evaluation, asset, threat, onChange, canEdit, commentKind }) {
  const { libraryScenarios } = useWorkspace();
  const r1 = calcRisk(evaluation.consequenceR1, evaluation.likelihoodR1);
  const r2 = calcRisk(evaluation.consequenceR2, evaluation.likelihoodR2);

  const suggestions = useMemo(() => {
    if (!evaluation.scenario || evaluation.scenario.length < 8) return [];
    return libraryScenarios.map((entry) => ({ ...entry, score: similarity(evaluation.scenario, entry.text) }))
      .filter((entry) => entry.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [evaluation.scenario, libraryScenarios]);

  const textareaClass =
    "w-full rounded-md border border-border-default bg-surface-base px-3 py-2 text-[13px] focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus resize-none disabled:bg-surface-muted disabled:text-text-muted disabled:cursor-default";

  return (
    <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle bg-surface-muted/40 px-5 py-3">
        <div>
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Evaluation
          </div>
          <div className="text-[15px] font-semibold text-text-primary">
            {asset?.name} <span className="font-normal text-text-disabled">×</span> {threat?.name || threat?.classification}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {commentKind ? (
            <CommentAffordance
              section="Section 6 — Vulnerability Assessment"
              sectionId={6}
              anchor={`${asset?.name} × ${threat?.name || threat?.classification}`}
              kind={commentKind}
            />
          ) : null}
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase text-text-muted">R1 → R2</div>
            <div className="mt-0.5 flex items-center gap-1">
              <RiskChip rating={r1} />
              <ArrowRight size={11} className="text-text-disabled" aria-hidden />
              <RiskChip rating={r2} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
        <div className="space-y-4 border-r border-border-subtle p-5 lg:col-span-2">
          <Field label="Risk scenario" required>
            <div className="relative">
              <textarea
                value={evaluation.scenario || ""}
                onChange={(event) => onChange({ scenario: event.target.value })}
                disabled={!canEdit}
                rows={2}
                placeholder="Describe the threat scenario..."
                className={textareaClass}
              />
              {suggestions.length > 0 ? (
                <div className="mt-1.5 rounded-md border border-primary-200 bg-primary-50 p-2 dark:border-primary-700 dark:bg-primary-900/80">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <FileSearch size={10} className="text-primary dark:text-primary-300" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary dark:text-primary-300">
                      Library matches (semantic)
                    </span>
                    <span className="ml-auto text-[10px] text-primary dark:text-primary-300">advisory</span>
                  </div>
                  <div className="space-y-1">
                    {suggestions.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onChange({ scenario: entry.text })}
                        disabled={!canEdit}
                        className="group flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-surface-base disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <div className="flex-1 truncate text-[12px] text-text-secondary">{entry.text}</div>
                        <div className="shrink-0 text-[10px] text-primary dark:text-primary-300 tabular-nums">
                          {(entry.score * 100).toFixed(0)}% match
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Field>

          <Field label="Consequences of scenario">
            <textarea
              value={evaluation.consequences || ""}
              onChange={(event) => onChange({ consequences: event.target.value })}
              disabled={!canEdit}
              rows={2}
              className={textareaClass}
            />
          </Field>

          <Field label="Existing controls / mitigation">
            <textarea
              value={evaluation.existingControls || ""}
              onChange={(event) => onChange({ existingControls: event.target.value })}
              disabled={!canEdit}
              rows={2}
              className={textareaClass}
            />
          </Field>

          <Field label="Vulnerabilities">
            <textarea
              value={evaluation.vulnerabilities || ""}
              onChange={(event) => onChange({ vulnerabilities: event.target.value })}
              disabled={!canEdit}
              rows={2}
              className={textareaClass}
            />
          </Field>

          <Field label="Proposed mitigation">
            <textarea
              value={evaluation.proposedMitigation || ""}
              onChange={(event) => onChange({ proposedMitigation: event.target.value })}
              disabled={!canEdit}
              rows={2}
              className={textareaClass}
            />
          </Field>
        </div>

        <div className="bg-surface-muted/40 p-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Risk calculation
          </div>

          <RiskBlock
            label="Pre-mitigation (R1)"
            consequence={evaluation.consequenceR1}
            likelihood={evaluation.likelihoodR1}
            onChange={(c, l) => onChange({ consequenceR1: c, likelihoodR1: l })}
            rating={r1}
            canEdit={canEdit}
          />

          <div className="my-4 border-t border-border-default" />

          <RiskBlock
            label="Post-mitigation (R2)"
            consequence={evaluation.consequenceR2}
            likelihood={evaluation.likelihoodR2}
            onChange={(c, l) => onChange({ consequenceR2: c, likelihoodR2: l })}
            rating={r2}
            canEdit={canEdit}
          />

          {r1 && r2 && r2.score < r1.score ? (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-zinc-900">
              <CheckCircle2 size={11} className="mr-1 inline" aria-hidden />
              {r1.band !== r2.band ? (
                <>
                  Risk reduced from <span className="font-semibold">{r1.band}</span> to {" "}
                  <span className="font-semibold">{r2.band}</span> (
                  {Math.round(((r1.score - r2.score) / r1.score) * 100)}% score reduction).
                </>
              ) : (
                <>
                  Risk reduced within <span className="font-semibold">{r1.band}</span> band (
                  {Math.round(((r1.score - r2.score) / r1.score) * 100)}% score reduction).
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EvaluationSection({ assessment, errors }) {
  const { session } = useAuth();
  const {
    assets,
    threats,
    matrix,
    evaluations,
    toggleMatrix,
    upsertEvaluation,
    showToast
  } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const candidates = useMemo(() => {
    const out = [];
    Object.keys(matrix).forEach((key) => {
      if (!matrix[key]) return;
      const [assetId, threatId] = key.split("|");
      const existing = evaluations.find((e) => e.assetId === assetId && e.threatId === threatId);
      out.push({ key, assetId, threatId, existing });
    });
    return out;
  }, [matrix, evaluations]);

  const fallbackId = candidates.find((c) => c.existing)?.existing?.id || evaluations[0]?.id || null;
  const currentId = activeId || fallbackId;
  const active = currentId ? evaluations.find((e) => e.id === currentId) : null;
  const focusedKey = active ? `${active.assetId}|${active.threatId}` : null;

  /* Completion summary for the header chip. Counts every IN-SCOPE
     cell, not just rows that exist in `evaluations` — a missing row
     counts as "not complete". */
  const totals = useMemo(() => {
    const scoped = candidates.length;
    const complete = candidates.filter(
      (cell) => cell.existing && isEvaluationComplete(cell.existing)
    ).length;
    return { scoped, complete };
  }, [candidates]);

  useEffect(() => {
    if (!active && fallbackId) {
      setActiveId(fallbackId);
    }
  }, [active, fallbackId]);

  /* Deep-link from Section 5: ?focus=assetId|threatId. Match the focused
     cell to an existing evaluation and select it. Unknown values are
     ignored gracefully. After consuming, clear the search param so back-
     navigation doesn't re-fire the focus. */
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    const [assetId, threatId] = focus.split("|");
    if (!assetId || !threatId) {
      setSearchParams({}, { replace: true });
      return;
    }
    const existing = evaluations.find(
      (e) => e.assetId === assetId && e.threatId === threatId
    );
    if (existing) {
      setActiveId(existing.id);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, evaluations]);

  const isAuthor = session.actingRole === ROLES.AUTHOR;
  const canEdit = isAuthor && assessment?.state === ASSESSMENT_STATES.DRAFT;
  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  function assetById(id) {
    return assets.find((a) => a.id === id);
  }

  function threatById(id) {
    return threats.find((t) => t.id === id);
  }

  /* Create an empty evaluation row and return its id (for sidebar
     matrix click-to-focus on a freshly-ticked cell). */
  const createEvaluationStub = useCallback(
    (assetId, threatId) => {
      const id = `e-${assetId}-${threatId}-${Date.now()}`;
      const seed = {
        id,
        assetId,
        threatId,
        scenario: "",
        consequences: "",
        existingControls: "",
        vulnerabilities: "",
        proposedMitigation: "",
        consequenceR1: 0,
        likelihoodR1: 0,
        consequenceR2: 0,
        likelihoodR2: 0
      };
      upsertEvaluation(seed);
      return id;
    },
    [upsertEvaluation]
  );

  function handleRowClick(cell) {
    if (cell.existing) {
      setActiveId(cell.existing.id);
      return;
    }
    if (!canEdit) return;
    const id = createEvaluationStub(cell.assetId, cell.threatId);
    setActiveId(id);
  }

  const actor = { name: session.user.name, role: session.actingRole };

  /* Sidebar matrix click handler. Decision A: tick + create + focus
     editor immediately for the typical "I want to evaluate this"
     intent. Show an undo toast for the misclick recovery case.
     If a prior right-click left an orphaned eval row for this cell,
     prefer reusing it so the user's data is restored on re-tick. */
  function handleMatrixClick(assetId, threatId, state) {
    if (state === "unscoped") {
      if (!canEdit) return;
      const previousActiveId = activeId;
      toggleMatrix(assetId, threatId, actor);
      const orphan = evaluations.find(
        (e) => e.assetId === assetId && e.threatId === threatId
      );
      const id = orphan ? orphan.id : createEvaluationStub(assetId, threatId);
      setActiveId(id);
      const asset = assetById(assetId);
      const threat = threatById(threatId);
      const label = `${asset?.name || assetId} \u00d7 ${
        threat?.short || threat?.classification || threatId
      }`;
      showToast(`Added ${label} to scope`, {
        action: {
          label: "Undo",
          onClick: () => {
            toggleMatrix(assetId, threatId, actor);
            setActiveId(previousActiveId);
          }
        }
      });
      return;
    }
    const existing = evaluations.find(
      (e) => e.assetId === assetId && e.threatId === threatId
    );
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    if (!canEdit) return;
    const id = createEvaluationStub(assetId, threatId);
    setActiveId(id);
  }

  /* Untick a cell. If the unticked cell was focused, fall back so
     the editor doesn't render against a now-orphaned row. */
  function performUntick(assetId, threatId) {
    const wasFocused = focusedKey === `${assetId}|${threatId}`;
    toggleMatrix(assetId, threatId, actor);
    if (wasFocused) {
      setActiveId(null);
    }
  }

  /* Right-click affordance to remove a cell from scope without leaving
     Section 6. Empty stubs untick instantly. Cells with any user data
     prompt a confirmation modal so the user can't accidentally hide
     work they've done. */
  function handleMatrixContextMenu(assetId, threatId, state) {
    if (!canEdit || state === "unscoped") return;
    const existing = evaluations.find(
      (e) => e.assetId === assetId && e.threatId === threatId
    );
    if (existing && evaluationHasAnyData(existing)) {
      const asset = assetById(assetId);
      const threat = threatById(threatId);
      setRemoveTarget({
        assetId,
        threatId,
        label: `${asset?.name || assetId} \u00d7 ${
          threat?.short || threat?.classification || threatId
        }`
      });
      return;
    }
    performUntick(assetId, threatId);
  }

  function handleEditorChange(patch) {
    if (!active) return;
    upsertEvaluation({ ...active, ...patch });
  }

  const completionChip =
    totals.scoped > 0 ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-text-secondary">
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            totals.complete === totals.scoped
              ? "bg-severity-low-fill"
              : "bg-severity-medium-fill"
          }`}
        />
        {totals.complete} of {totals.scoped} complete
      </span>
    ) : null;

  return (
    <SectionShell
      number={6}
      title="Vulnerability Assessment & Risk Treatment"
      description="For each asset–threat combination, capture the risk scenario, controls, vulnerabilities, and proposed mitigations. R1 and R2 calculate from the 5×5 matrix."
      actions={completionChip}
    >
      <ValidationSummary errors={errors} />
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="flex flex-col gap-3 lg:w-[260px] lg:shrink-0">
          <div className="rounded-lg border border-border-default bg-surface-raised p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Overview
              </div>
              <div className="text-[10px] text-text-muted">
                click to focus &middot; right-click to remove
              </div>
            </div>
            <div className="overflow-x-auto">
              <AssetThreatMatrix
                assets={assets}
                threats={threats}
                matrix={matrix}
                evaluations={evaluations}
                mode="compact"
                focusedKey={focusedKey}
                readOnly={!canEdit}
                onCellClick={handleMatrixClick}
                onCellContextMenu={handleMatrixContextMenu}
              />
            </div>
            <MatrixLegend className="mt-3" />
          </div>

          <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
            <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted/60 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Evaluations
              </div>
              <span className="text-[11px] tabular-nums text-text-muted">{candidates.length}</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-text-muted">
                  No matrix cells ticked yet. Use Section 5 (or the overview above) to scope.
                </p>
              ) : null}
              {candidates.map((cell) => {
                const asset = assetById(cell.assetId);
                const threat = threatById(cell.threatId);
                const isActive = cell.existing && cell.existing.id === currentId;
                const state = getEvaluationStatus(cell.existing);
                const r1 = cell.existing
                  ? calcRisk(cell.existing.consequenceR1, cell.existing.likelihoodR1)
                  : null;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => handleRowClick(cell)}
                    className={`w-full border-b border-border-subtle px-3 py-2 text-left transition-colors hover:bg-surface-muted/60 ${
                      isActive
                        ? "border-l-2 border-l-primary bg-primary-50 dark:bg-primary-900/80"
                        : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <ListStatusDot state={state} />
                      <div className="flex-1 truncate text-[12px] font-medium text-text-primary">
                        {asset?.name} × {threat?.short || threat?.classification}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-4">
                      <div className="flex-1 truncate text-[11px] text-text-muted">
                        {cell.existing?.scenario ? (
                          cell.existing.scenario
                        ) : (
                          <span className="italic text-text-disabled">No evaluation yet</span>
                        )}
                      </div>
                      {r1 ? <RiskChip rating={r1} /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {active ? (
            <EvaluationEditor
              key={active.id}
              evaluation={active}
              asset={assetById(active.assetId)}
              threat={threatById(active.threatId)}
              onChange={handleEditorChange}
              canEdit={canEdit}
              commentKind={commentKind}
            />
          ) : (
            <div className="rounded-lg border border-border-default bg-surface-raised p-8 text-center text-sm text-text-muted">
              Select an evaluation from the list to edit.
            </div>
          )}
        </div>
      </div>

      <RemoveFromScopeModal
        open={Boolean(removeTarget)}
        label={removeTarget?.label}
        onConfirm={() => {
          performUntick(removeTarget.assetId, removeTarget.threatId);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </SectionShell>
  );
}
