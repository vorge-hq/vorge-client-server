import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { ASSESSMENT_STATES } from "../assessmentModel";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

export function AssetThreatMatrixSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const { assets, threats, matrix, evaluations, toggleMatrix } = useWorkspace();
  const [view, setView] = useState("grid");

  const canComment =
    session.actingRole === ROLES.REVIEWER &&
    assessment?.state === ASSESSMENT_STATES.IN_REVIEW;

  const evalKey = useMemo(() => {
    const set = new Set();
    evaluations.forEach((e) => set.add(`${e.assetId}|${e.threatId}`));
    return set;
  }, [evaluations]);

  function isTicked(assetId, threatId) {
    return Boolean(matrix[`${assetId}|${threatId}`]);
  }

  function evaluationStatus(assetId, threatId) {
    if (!isTicked(assetId, threatId)) return null;
    return evalKey.has(`${assetId}|${threatId}`) ? "evaluated" : "missing";
  }

  return (
    <SectionShell
      number={5}
      title="Asset Attractiveness Cross-Reference"
      description="Tick the threats that materially apply to each asset. Ticking a cell prompts an evaluation in Section 6."
      actions={
        <div className="flex items-center gap-2">
          {canComment ? (
            <CommentAffordance
              section="Section 5 — Asset Attractiveness Cross-Reference"
              sectionId={5}
            />
          ) : null}
          <div className="inline-flex rounded-md border border-zinc-200 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded px-2 py-1 ${view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("by-threat")}
              className={`rounded px-2 py-1 ${view === "by-threat" ? "bg-zinc-900 text-white" : "text-zinc-700"}`}
            >
              By threat
            </button>
          </div>
        </div>
      }
    >
      <ValidationSummary errors={errors} />
      {view === "grid" ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-zinc-50">
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Asset
                </th>
                {threats.map((threat) => (
                  <th
                    key={threat.id}
                    className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                  >
                    {threat.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
                    <p className="text-[12px] font-medium text-zinc-900">{asset.name}</p>
                    <p className="text-[10px] text-zinc-500">{asset.type}</p>
                  </td>
                  {threats.map((threat) => {
                    const ticked = isTicked(asset.id, threat.id);
                    const status = evaluationStatus(asset.id, threat.id);
                    return (
                      <td key={threat.id} className="px-1 py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => !readOnly && toggleMatrix(asset.id, threat.id)}
                          disabled={readOnly}
                          aria-pressed={ticked}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-[10px] transition-colors ${
                            ticked
                              ? "border-[#1E3A5F] bg-[#EFF4FB] text-[#1E3A5F]"
                              : "border-zinc-200 bg-white text-zinc-400 hover:bg-zinc-50"
                          } ${readOnly ? "cursor-not-allowed" : ""}`}
                        >
                          {ticked ? <Check size={12} strokeWidth={2.5} /> : ""}
                        </button>
                        {ticked ? (
                          <p className="mt-0.5 text-[9px] font-medium leading-tight">
                            {status === "evaluated" ? (
                              <span className="text-emerald-700">Eval ✓</span>
                            ) : (
                              <span className="text-amber-700">Missing</span>
                            )}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3">
          {threats.map((threat) => {
            const linkedAssets = assets.filter((asset) => isTicked(asset.id, threat.id));
            return (
              <details key={threat.id} className="rounded-lg border border-zinc-200">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-medium text-zinc-900">
                  <span className="inline-flex items-center gap-2">
                    {threat.classification}
                    <Chip tone="slate">{linkedAssets.length} assets</Chip>
                  </span>
                </summary>
                <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                  {assets.map((asset) => {
                    const ticked = isTicked(asset.id, threat.id);
                    return (
                      <li
                        key={asset.id}
                        className="flex items-center justify-between px-3 py-2 text-[12px]"
                      >
                        <div>
                          <p className="font-medium text-zinc-900">{asset.name}</p>
                          <p className="text-[10px] text-zinc-500">{asset.type}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => !readOnly && toggleMatrix(asset.id, threat.id)}
                          disabled={readOnly}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                            ticked
                              ? "border-[#1E3A5F] bg-[#EFF4FB] text-[#1E3A5F]"
                              : "border-zinc-200 bg-white text-zinc-600"
                          }`}
                        >
                          {ticked ? <Check size={10} /> : <Plus size={10} />}
                          {ticked ? "Linked" : "Link"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
        Ticked cells without an evaluation are flagged in Section 6. Untick cautiously — dependent evaluations
        warn before deletion.
      </div>
    </SectionShell>
  );
}
