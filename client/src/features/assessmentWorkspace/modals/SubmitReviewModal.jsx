import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

export function SubmitReviewModal({ assets, evaluations, onClose, onSubmit }) {
  const checks = useMemo(() => {
    const assetCount = assets?.length || 0;
    const evaluationCount = evaluations?.length || 0;
    const evaluatedAssets = new Set((evaluations || []).map((e) => e.assetId)).size;
    return [
      {
        id: "assets",
        label: "Asset disaggregation",
        ok: assetCount >= 5,
        detail: `${assetCount} assets registered. Section 3 master list complete.`
      },
      {
        id: "threats",
        label: "Threat assessment",
        ok: true,
        detail: "8 threats configured with rating, history, and capability."
      },
      {
        id: "matrix",
        label: "Asset × Threat matrix",
        ok: evaluatedAssets >= 4,
        detail: `${evaluatedAssets} assets cross-referenced. Matrix has at least one tick per critical asset.`
      },
      {
        id: "evaluations",
        label: "Vulnerability assessment",
        ok: evaluationCount >= 4,
        detail: `${evaluationCount} evaluations with R1/R2 scores and proposed mitigations.`
      },
      {
        id: "mitigation",
        label: "Proposed mitigation table",
        ok: true,
        detail: "Severity, owner, agreed status, and target date set on each mitigation."
      },
      {
        id: "summary",
        label: "Executive summary & conclusion",
        ok: true,
        detail: "Sections 1 and 8 are populated."
      }
    ];
  }, [assets, evaluations]);

  const allOk = checks.every((c) => c.ok);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">Submit for review</div>
            <div className="text-[11px] text-zinc-500">
              The Reviewer is notified once the assessment moves to In Review. Authors cannot edit until the
              Reviewer sends back or marks complete.
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2"
            >
              {check.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" />
              )}
              <div className="flex-1 text-[12px]">
                <div className="font-medium text-zinc-900">{check.label}</div>
                <div className="text-zinc-600">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!allOk}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
          >
            Submit to Reviewer
          </button>
        </div>
      </div>
    </div>
  );
}
