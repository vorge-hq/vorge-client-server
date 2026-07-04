import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { Banner } from "../../../components/Banner";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import {
  evaluationHasAnyData,
  getCommentPermission,
  getEvaluationStatus
} from "../assessmentModel";
import { AssetThreatMatrix, MatrixLegend } from "../AssetThreatMatrix";
import { RemoveFromScopeModal } from "../RemoveFromScopeModal";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

/* Cell-state -> dot symbol used in the by-threat view's per-asset row.
   Mirrors the matrix's visual language for consistency. */
const BY_THREAT_DOT = {
  unscoped: { className: "border-border-default bg-surface-base", label: "Not in scope" },
  missing: { className: "border-border-strong bg-border-strong", label: "Missing" },
  "in-progress": {
    className: "border-severity-medium-fill bg-severity-medium-fill",
    label: "In progress"
  },
  complete: {
    className: "border-severity-low-fill bg-severity-low-fill",
    label: "Complete"
  }
};

function StatusDot({ state }) {
  const tokens = BY_THREAT_DOT[state] || BY_THREAT_DOT.unscoped;
  return (
    <span
      aria-label={tokens.label}
      title={tokens.label}
      className={`inline-block h-2 w-2 rounded-full border ${tokens.className}`}
    />
  );
}

export function AssetThreatMatrixSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const { assets, threats, matrix, evaluations, toggleMatrix, showToast } = useWorkspace();
  const navigate = useNavigate();
  const [view, setView] = useState("grid");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [conflict, setConflict] = useState(null);

  function surface(result) {
    if (result?.conflict) setConflict(result.error);
    else if (result?.error) showToast(result.error, { tone: "error" });
    else setConflict(null);
  }

  // Toggle a matrix cell and surface a lost lock_version race (prod). In demo the
  // result is always { ok }, so this is a no-op wrapper.
  async function applyToggle(assetId, threatId) {
    surface(await toggleMatrix(assetId, threatId, actor));
  }

  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  function isTicked(assetId, threatId) {
    return Boolean(matrix[`${assetId}|${threatId}`]);
  }

  function statusFor(assetId, threatId) {
    if (!isTicked(assetId, threatId)) return "unscoped";
    const evaluation = evaluations.find(
      (e) => e.assetId === assetId && e.threatId === threatId
    );
    return getEvaluationStatus(evaluation);
  }

  function focusInSection6(assetId, threatId) {
    navigate(
      `/assessments/${assessment.id}/sections/6?focus=${encodeURIComponent(`${assetId}|${threatId}`)}`
    );
  }

  const actor = { name: session.user.name, role: session.actingRole };

  function handleCellClick(assetId, threatId, state) {
    if (readOnly) return;
    if (state === "unscoped") {
      applyToggle(assetId, threatId);
      return;
    }
    focusInSection6(assetId, threatId);
  }

  /* Right-click on an in-scope cell removes it from scope. Cells with
     any user data prompt a confirmation modal so the user doesn't
     accidentally hide work they've done. Empty stubs untick instantly. */
  function requestUntick(assetId, threatId) {
    if (readOnly) return;
    const existing = evaluations.find(
      (e) => e.assetId === assetId && e.threatId === threatId
    );
    if (existing && evaluationHasAnyData(existing)) {
      const asset = assets.find((a) => a.id === assetId);
      const threat = threats.find((t) => t.id === threatId);
      setRemoveTarget({
        assetId,
        threatId,
        label: `${asset?.name || assetId} \u00d7 ${
          threat?.short || threat?.classification || threatId
        }`
      });
      return;
    }
    applyToggle(assetId, threatId);
  }

  function handleCellContextMenu(assetId, threatId, state) {
    if (readOnly || state === "unscoped") return;
    requestUntick(assetId, threatId);
  }

  return (
    <SectionShell
      number={5}
      title="Asset Attractiveness Cross-Reference"
      description="Tick the threats that materially apply to each asset. Cells show evaluation status. Click a ticked cell to jump to Section 6; right-click to remove from scope."
      actions={
        <div className="flex items-center gap-2">
          {commentKind ? (
            <CommentAffordance
              section="Section 5 — Asset Attractiveness Cross-Reference"
              sectionId={5}
              kind={commentKind}
            />
          ) : null}
          <div className="inline-flex rounded-md border border-border-default p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded px-2 py-1 ${view === "grid" ? "bg-zinc-900 text-white" : "text-text-secondary"}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("by-threat")}
              className={`rounded px-2 py-1 ${view === "by-threat" ? "bg-zinc-900 text-white" : "text-text-secondary"}`}
            >
              By threat
            </button>
          </div>
        </div>
      }
    >
      <ValidationSummary errors={errors} />
      {conflict ? (
        <Banner tone="error" title="Changes not saved">
          {conflict}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline font-medium">
            Reload
          </button>
        </Banner>
      ) : null}
      {view === "grid" ? (
        <div className="overflow-x-auto rounded-lg border border-border-default bg-surface-raised p-4">
          <AssetThreatMatrix
            assets={assets}
            threats={threats}
            matrix={matrix}
            evaluations={evaluations}
            mode="edit"
            readOnly={readOnly}
            onCellClick={handleCellClick}
            onCellContextMenu={handleCellContextMenu}
          />
          <MatrixLegend className="mt-4" />
        </div>
      ) : (
        <div className="grid gap-3">
          {threats.map((threat) => {
            const linkedAssets = assets.filter((asset) => isTicked(asset.id, threat.id));
            return (
              <details key={threat.id} className="rounded-lg border border-border-default">
                <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-medium text-text-primary">
                  <span className="inline-flex items-center gap-2">
                    {threat.classification}
                    <Chip tone="slate">{linkedAssets.length} assets</Chip>
                  </span>
                </summary>
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {assets.map((asset) => {
                    const ticked = isTicked(asset.id, threat.id);
                    const state = statusFor(asset.id, threat.id);
                    return (
                      <li
                        key={asset.id}
                        className="flex items-center justify-between px-3 py-2 text-[12px]"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot state={state} />
                          <div>
                            <p className="font-medium text-text-primary">{asset.name}</p>
                            <p className="text-[10px] text-text-muted">{asset.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ticked ? (
                            <button
                              type="button"
                              onClick={() => focusInSection6(asset.id, threat.id)}
                              className="text-[11px] font-medium text-primary hover:underline"
                            >
                              Open in Section 6 →
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (readOnly) return;
                              if (ticked) {
                                requestUntick(asset.id, threat.id);
                              } else {
                                applyToggle(asset.id, threat.id);
                              }
                            }}
                            disabled={readOnly}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                              ticked
                                ? "border-primary bg-primary-50 text-primary dark:bg-primary-900/40"
                                : "border-border-default bg-surface-raised text-text-muted"
                            }`}
                          >
                            {ticked ? <Check size={10} /> : <Plus size={10} />}
                            {ticked ? "Linked" : "Link"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <div className="rounded-md border border-border-default bg-surface-muted px-3 py-2 text-[11px] text-text-muted">
        Ticked cells without an evaluation are flagged in Section 6. Untick cautiously — dependent evaluations
        warn before deletion.
      </div>

      <RemoveFromScopeModal
        open={Boolean(removeTarget)}
        label={removeTarget?.label}
        onConfirm={() => {
          applyToggle(removeTarget.assetId, removeTarget.threatId);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </SectionShell>
  );
}
