import { getBandClasses } from "../features/assessmentWorkspace/riskMatrix";
import { getStateChipClasses } from "../features/assessmentWorkspace/assessmentModel";
import { ROLE_TONE } from "../auth/session";

export function Chip({ children, tone = "slate", className = "" }) {
  const tones = {
    slate: "bg-zinc-100 text-zinc-700 border border-zinc-200",
    info: "bg-blue-50 text-blue-800 border border-blue-200",
    success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    warn: "bg-amber-50 text-amber-900 border border-amber-200",
    danger: "bg-red-50 text-red-800 border border-red-200",
    dark: "bg-vantage-navy text-white border border-vantage-navy"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.slate} ${className}`}
    >
      {children}
    </span>
  );
}

export function StateChip({ state, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getStateChipClasses(state)} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {state}
    </span>
  );
}

export function RiskChip({ band, score, className = "" }) {
  const label = band ? (score != null ? `${band} (${score})` : band) : "—";
  const classes = band ? getBandClasses(band) : "bg-zinc-100 text-zinc-600";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${classes} ${className}`}
    >
      {label}
    </span>
  );
}

export function SeverityChip({ severity, className = "" }) {
  return <RiskChip band={severity} className={className} />;
}

export function StatusChip({ status, className = "" }) {
  const styles = {
    Open: "bg-zinc-100 text-zinc-700 border border-zinc-200",
    "In Progress": "bg-blue-50 text-blue-800 border border-blue-200",
    Done: "bg-emerald-50 text-emerald-800 border border-emerald-200"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || styles.Open} ${className}`}
    >
      {status}
    </span>
  );
}

export function AgreedChip({ agreed, className = "" }) {
  const styles = {
    Yes: "bg-emerald-50 text-emerald-800 border border-emerald-200",
    No: "bg-red-50 text-red-800 border border-red-200",
    Pending: "bg-amber-50 text-amber-900 border border-amber-200"
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[agreed] || styles.Pending} ${className}`}
    >
      {agreed}
    </span>
  );
}

export function RoleChip({ role, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_TONE[role] || "bg-zinc-100 text-zinc-700 border border-zinc-200"} ${className}`}
    >
      {role}
    </span>
  );
}
