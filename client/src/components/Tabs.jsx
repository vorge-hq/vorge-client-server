export function Tabs({ tabs, activeId, onChange, ariaLabel = "Section tabs" }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(tab.id)}
            className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active ? "bg-white text-zinc-900 shadow-card" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {tab.label}
            {tab.count != null ? (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-700"}`}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
