export function Tabs({ tabs, activeId, onChange, ariaLabel = "Section tabs" }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-end gap-x-[22px] border-b border-border-default"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(tab.id)}
            className={`focus-ring -mb-px border-b-2 px-1 py-2 text-[13px] transition ${
              active
                ? "border-text-primary font-medium text-text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
            {tab.count != null ? (
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  active
                    ? "bg-surface-muted text-text-primary"
                    : "bg-surface-muted text-text-secondary"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
