export function KpiCard({ label, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    danger: "border-red-200 bg-red-50",
    warn: "border-amber-200 bg-amber-50",
    success: "border-emerald-200 bg-emerald-50",
    info: "border-blue-200 bg-blue-50"
  };

  const toneText = {
    default: "text-slate-900",
    danger: "text-red-700",
    warn: "text-amber-800",
    success: "text-emerald-700",
    info: "text-blue-800"
  };

  return (
    <article
      className={`rounded-2xl border ${tones[tone] || tones.default} p-5 shadow-card`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneText[tone] || toneText.default}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}
