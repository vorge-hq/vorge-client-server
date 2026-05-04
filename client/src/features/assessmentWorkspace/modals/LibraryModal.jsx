import { useMemo, useState } from "react";
import { BookOpen, Search, Tag, X } from "lucide-react";
import { LIBRARY_SCENARIOS, similarity } from "../../../data/library";

export function LibraryModal({ onClose, onUse }) {
  const [query, setQuery] = useState("Theft of materials from yard during night shift");

  const ranked = useMemo(() => {
    if (!query) return LIBRARY_SCENARIOS.map((entry) => ({ entry, score: 0 }));
    return LIBRARY_SCENARIOS.map((entry) => ({ entry, score: similarity(query, entry.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ background: "#EFF4FB" }}
            >
              <BookOpen size={16} className="text-[#1E3A5F]" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Library — semantic search</div>
              <div className="text-[11px] text-zinc-500">
                Reuse vetted scenario, mitigation, vulnerability, and control text. Audit-friendly references.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-zinc-100 px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-zinc-400" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a scenario or fragment to find similar entries"
              className="field-control pl-9 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {ranked.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-zinc-500">
              No library matches yet — try different wording.
            </p>
          ) : (
            <ul className="space-y-2">
              {ranked.map(({ entry, score }) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-zinc-200 px-3 py-2.5 hover:border-[#1E3A5F]/40 hover:bg-[#EFF4FB]/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-[13px] text-zinc-900">{entry.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5"
                          >
                            <Tag size={9} aria-hidden /> {tag}
                          </span>
                        ))}
                        {score > 0 ? (
                          <span className="ml-auto text-[10px] tabular-nums text-zinc-400">
                            similarity {Math.round(score * 100)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUse?.(entry)}
                      className="btn-secondary text-[11px]"
                    >
                      Use entry
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/40 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
