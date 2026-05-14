import { useMemo, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

function buildDraft(assets = [], evaluations = []) {
  const counts = {
    veryHigh: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  evaluations.forEach((e) => {
    const score = (e.consequenceR1 || 0) * (e.likelihoodR1 || 0);
    if (score >= 16) counts.veryHigh += 1;
    else if (score >= 10) counts.high += 1;
    else if (score >= 5) counts.medium += 1;
    else counts.low += 1;
  });
  const topAsset = assets[0]?.name || "Asset 1";
  const topThreat = evaluations[0]
    ? `${evaluations[0].assetId.toUpperCase()} × ${evaluations[0].threatId.toUpperCase()}`
    : "Asset × Threat";
  return [
    `This Security Risk Assessment evaluates ${assets.length} primary assets across 8 threat categories. The cross-reference matrix produced ${evaluations.length} formal evaluations.`,
    `Pre-mitigation risk distribution: ${counts.veryHigh} Very High, ${counts.high} High, ${counts.medium} Medium, ${counts.low} Low. The most material exposure relates to ${topAsset} (${topThreat}), where consequence severity warrants targeted mitigation.`,
    "Proposed mitigations focus on access control hardening, detection coverage, vendor cyber controls, and operational drill cadence. When agreed and tracked, residual risk is reduced to within tolerance bands across the assessed scenarios.",
    "Approval should be conditioned on confirmation of mitigation owners and target dates. Section 7 will be tracked through the platform's mitigation workflow once the assessment is approved."
  ].join("\n\n");
}

export function AIDraftModal({ assets, evaluations, onClose, onAccept, target = "Section 1 — Executive Summary" }) {
  const [stage, setStage] = useState("loading");
  const draft = useMemo(() => buildDraft(assets, evaluations), [assets, evaluations]);

  if (stage === "loading") {
    setTimeout(() => setStage("ready"), 700);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-900/40">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">AI drafted summary</div>
              <div className="text-[11px] text-text-muted">{target}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {stage === "loading" ? (
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-muted px-4 py-6 text-[13px] text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Drafting from assets and evaluations…
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-lg border bg-[var(--semantic-info-bg)] px-3 py-2 text-[11px] text-[var(--semantic-info-text)] border-[var(--semantic-info-text)]">
                AI generated draft — clearly labelled and audit-logged. Review and edit before saving.
              </div>
              <textarea
                defaultValue={draft}
                rows={14}
                className="field-control resize-y text-[13px] leading-relaxed"
              />
              <p className="mt-2 text-[10px] text-text-disabled">
                Tokens: 612 · Latency 0.7s · Audit entry will record AI usage.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (onAccept) onAccept(draft);
              onClose?.();
            }}
            disabled={stage !== "ready"}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Accept draft
          </button>
        </div>
      </div>
    </div>
  );
}
