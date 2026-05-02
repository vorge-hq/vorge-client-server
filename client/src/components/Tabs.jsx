export function Tabs({ tabs, activeId, onChange, ariaLabel = "Section tabs" }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
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
              active ? "bg-white text-slate-900 shadow-card" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
            {tab.count != null ? (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"}`}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
