import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileSearch, Plus } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { similarity } from "../../../data/library";
import { useWorkspace } from "../WorkspaceContext";
import { ASSESSMENT_STATES } from "../assessmentModel";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

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

const RISK_BAND_STYLES = {
  low: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", border: "#a7f3d0" },
  med: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", border: "#fde68a" },
  high: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", border: "#fed7aa" },
  vhigh: { bg: "#fef2f2", text: "#991b1b", dot: "#dc2626", border: "#fecaca" }
};

function calcRisk(consequence, likelihood) {
  if (!consequence || !likelihood) return null;
  const score = consequence * likelihood;
  if (score <= 4) return { band: "Low", score, color: "low" };
  if (score <= 9) return { band: "Medium", score, color: "med" };
  if (score <= 15) return { band: "High", score, color: "high" };
  return { band: "Very High", score, color: "vhigh" };
}

function RiskChip({ rating, size = "sm" }) {
  if (!rating) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  const style = RISK_BAND_STYLES[rating.color];
  const dim = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-medium ${dim}`}
      style={{ background: style.bg, color: style.text, borderColor: style.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} />
      {rating.band}
      <span className="font-normal opacity-60 tabular-nums">· {rating.score}</span>
    </span>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-zinc-700">
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
        <div className="flex flex-1 justify-around text-[8px] font-medium text-zinc-400">
          {cols.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="flex w-3 flex-col justify-around pr-1 text-[8px] font-medium text-zinc-400">
          {rows.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-5 gap-[2px]">
          {rows.flatMap((r) =>
            cols.map((c) => {
              const score = r * c;
              const band = score <= 4 ? "low" : score <= 9 ? "med" : score <= 15 ? "high" : "vhigh";
              const style = RISK_BAND_STYLES[band];
              const isActive = consequence === r && likelihood === c;
              return (
                <div
                  key={`${r}-${c}`}
                  className="relative aspect-square rounded-sm"
                  style={{
                    background: style.dot,
                    opacity: isActive ? 1 : 0.18,
                    outline: isActive ? "2px solid #18181b" : "none",
                    outlineOffset: isActive ? "1px" : "0"
                  }}
                  title={`Consequence ${r} × Likelihood ${c} = ${score}`}
                >
                  {isActive ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                      {score}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[9px] text-zinc-500">
        <span>Likelihood →</span>
      </div>
    </div>
  );
}

function RiskBlock({ label, consequence, likelihood, onChange, rating, canEdit = true }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-medium text-zinc-700">{label}</div>
        <RiskChip rating={rating} />
      </div>

      <div className="space-y-2">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Consequence</div>
          <select
            value={consequence || 0}
            onChange={(event) => onChange(parseInt(event.target.value, 10), likelihood)}
            disabled={!canEdit}
            className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-[12px] focus:border-zinc-400 focus:outline-none disabled:cursor-default disabled:bg-zinc-50 disabled:text-zinc-700"
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
          <div className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Likelihood</div>
          <select
            value={likelihood || 0}
            onChange={(event) => onChange(consequence, parseInt(event.target.value, 10))}
            disabled={!canEdit}
            className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-[12px] focus:border-zinc-400 focus:outline-none disabled:cursor-default disabled:bg-zinc-50 disabled:text-zinc-700"
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

function EvaluationEditor({ evaluation, asset, threat, onChange, canEdit, canComment }) {
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
    "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100 resize-none disabled:bg-zinc-50 disabled:text-zinc-700 disabled:cursor-default";

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 bg-zinc-50/40 px-5 py-3">
        <div>
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Evaluation
          </div>
          <div className="text-[15px] font-semibold text-zinc-900">
            {asset?.name} <span className="font-normal text-zinc-400">×</span> {threat?.name || threat?.classification}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canComment ? (
            <CommentAffordance
              section="Section 6 — Vulnerability Assessment"
              sectionId={6}
              anchor={`${asset?.name} × ${threat?.name || threat?.classification}`}
            />
          ) : null}
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase text-zinc-500">R1 → R2</div>
            <div className="mt-0.5 flex items-center gap-1">
              <RiskChip rating={r1} />
              <ArrowRight size={11} className="text-zinc-400" aria-hidden />
              <RiskChip rating={r2} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
        <div className="space-y-4 border-r border-zinc-100 p-5 lg:col-span-2">
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
                <div className="mt-1.5 rounded-md border border-[#C5D5E8] bg-[#EFF4FB]/50 p-2">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <FileSearch size={10} className="text-[#1E3A5F]" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1E3A5F]">
                      Library matches (semantic)
                    </span>
                    <span className="ml-auto text-[10px] text-[#1E3A5F]">advisory</span>
                  </div>
                  <div className="space-y-1">
                    {suggestions.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onChange({ scenario: entry.text })}
                        disabled={!canEdit}
                        className="group flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-white/80 disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <div className="flex-1 truncate text-[12px] text-zinc-700">{entry.text}</div>
                        <div className="shrink-0 text-[10px] text-[#1E3A5F] tabular-nums">
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

        <div className="bg-zinc-50/40 p-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
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

          <div className="my-4 border-t border-zinc-200" />

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
  const { assets, threats, matrix, evaluations, upsertEvaluation } = useWorkspace();
  const [activeId, setActiveId] = useState(null);

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

  useEffect(() => {
    if (!active && fallbackId) {
      setActiveId(fallbackId);
    }
  }, [active, fallbackId]);

  const isAuthor = session.actingRole === ROLES.AUTHOR;
  const isReviewer = session.actingRole === ROLES.REVIEWER;
  const canEdit = isAuthor && assessment?.state === ASSESSMENT_STATES.DRAFT;
  const canComment = isReviewer && assessment?.state === ASSESSMENT_STATES.IN_REVIEW;

  function assetById(id) {
    return assets.find((a) => a.id === id);
  }

  function threatById(id) {
    return threats.find((t) => t.id === id);
  }

  function handleRowClick(cell) {
    if (cell.existing) {
      setActiveId(cell.existing.id);
      return;
    }
    if (!canEdit) return;
    const id = `e-${cell.assetId}-${cell.threatId}-${Date.now()}`;
    const seed = {
      id,
      assetId: cell.assetId,
      threatId: cell.threatId,
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
    setActiveId(id);
  }

  function handleEditorChange(patch) {
    if (!active) return;
    upsertEvaluation({ ...active, ...patch });
  }

  return (
    <SectionShell
      number={6}
      title="Vulnerability Assessment & Risk Treatment"
      description="For each asset–threat combination, capture the risk scenario, controls, vulnerabilities, and proposed mitigations. R1 and R2 calculate from the 5×5 matrix."
    >
      <ValidationSummary errors={errors} />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white lg:w-[260px] lg:shrink-0">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Evaluations</div>
            <span className="text-[11px] tabular-nums text-zinc-500">{evaluations.length}</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-zinc-500">
                No matrix cells ticked yet. Use Section 5 to link assets to threats.
              </p>
            ) : null}
            {candidates.map((cell) => {
              const asset = assetById(cell.assetId);
              const threat = threatById(cell.threatId);
              const isActive = cell.existing && cell.existing.id === currentId;
              const r1 = cell.existing
                ? calcRisk(cell.existing.consequenceR1, cell.existing.likelihoodR1)
                : null;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => handleRowClick(cell)}
                  className={`w-full border-b border-zinc-100 px-3 py-2 text-left transition-colors hover:bg-zinc-50/60 ${
                    isActive ? "border-l-2 border-l-[#1E3A5F] bg-[#EFF4FB]/40" : ""
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="truncate text-[12px] font-medium text-zinc-900">
                      {asset?.name} × {threat?.short || threat?.classification}
                    </div>
                    {!cell.existing ? <Plus size={10} className="text-zinc-400" aria-hidden /> : null}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 truncate text-[11px] text-zinc-500">
                      {cell.existing?.scenario ? (
                        cell.existing.scenario
                      ) : (
                        <span className="italic text-zinc-400">No evaluation yet</span>
                      )}
                    </div>
                    {r1 ? <RiskChip rating={r1} /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {active ? (
            <EvaluationEditor
              key={active.id}
              evaluation={active}
              asset={assetById(active.assetId)}
              threat={threatById(active.threatId)}
              onChange={handleEditorChange}
              canEdit={canEdit}
              canComment={canComment}
            />
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              Select an evaluation from the list to edit.
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
