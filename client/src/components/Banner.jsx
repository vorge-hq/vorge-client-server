const TONE_STYLES = {
  info: "bg-blue-50 border-blue-200 text-blue-900",
  warn: "bg-amber-50 border-amber-200 text-amber-900",
  danger: "bg-red-50 border-red-200 text-red-900",
  success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  neutral: "bg-slate-100 border-slate-200 text-slate-700"
};

export function Banner({ tone = "info", title, children, action, icon }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start ${TONE_STYLES[tone] || TONE_STYLES.info}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {icon ? <span aria-hidden="true" className="text-xl leading-none">{icon}</span> : null}
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={`text-sm ${title ? "mt-1" : ""}`}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
