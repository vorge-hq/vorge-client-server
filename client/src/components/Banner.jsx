const TONE_STYLES = {
  info:    "bg-[var(--semantic-info-bg)] text-[var(--semantic-info-text)] border-[var(--semantic-info-text)]",
  warn:    "bg-[var(--semantic-warning-bg)] text-[var(--semantic-warning-text)] border-[var(--semantic-warning-text)]",
  danger:  "bg-[var(--semantic-error-bg)] text-[var(--semantic-error-text)] border-[var(--semantic-error-text)]",
  success: "bg-[var(--semantic-success-bg)] text-[var(--semantic-success-text)] border-[var(--semantic-success-text)]",
  neutral: "bg-zinc-100 border-zinc-200 text-zinc-700"
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
