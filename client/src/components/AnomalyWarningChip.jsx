import { AlertTriangle, Check } from "lucide-react";

/* AD-1 advisory anomaly affordance. Two states:
   - flagged + not acknowledged → warning chip with an Acknowledge action
     (button hidden when readOnly).
   - acknowledged → muted "acknowledged — {reason}" line (kept visible for
     transparency / the "logged for tuning" narrative, not hidden).
   Tokens only (semantic-warning + text-* role tokens); no raw colours. */
export function AnomalyWarningChip({
  message,
  acknowledged = false,
  ackReason = null,
  readOnly = false,
  onAcknowledge
}) {
  if (!message) return null;

  if (acknowledged) {
    return (
      <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs font-medium text-text-muted">
        <Check size={12} className="mt-0.5 shrink-0" aria-hidden />
        Anomaly acknowledged{ackReason ? ` — ${ackReason}` : ""}
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-md border border-[var(--semantic-warning-text)] bg-[var(--semantic-warning-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--semantic-warning-text)]">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      {readOnly ? null : (
        <button
          type="button"
          onClick={onAcknowledge}
          className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Acknowledge
        </button>
      )}
    </div>
  );
}
