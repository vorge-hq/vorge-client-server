import { useEffect, useState } from "react";
import { BookOpen, Search, Tag, X } from "lucide-react";
import { useWorkspace } from "../WorkspaceContext";
import { useAuth } from "../../../auth/AuthContext";

export function LibraryModal({ onClose, onUse }) {
  const { searchLibrary } = useWorkspace();
  const { session } = useAuth();
  const [query, setQuery] = useState("Theft of materials from yard during night shift");
  const [ranked, setRanked] = useState([]);

  // Search through the prod↔demo seam: demo ranks fixtures locally (no fetch),
  // prod embeds + cosine-ranks server-side. Debounced so typing doesn't fire a
  // request (or embedding cost) per keystroke; the cancelled flag drops
  // out-of-order responses.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchLibrary(query, session?.actingRole);
        if (!cancelled) setRanked(results);
      } catch {
        if (!cancelled) setRanked([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchLibrary, session?.actingRole]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-raised shadow-xl">
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-900/40">
              <BookOpen size={16} className="text-primary" />
            </div>
            <div>
              <div className="text-[14px] font-semibold">Library — semantic search</div>
              <div className="text-[11px] text-text-muted">
                Reuse vetted scenario, mitigation, vulnerability, and control text. Audit-friendly references.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border-subtle px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-text-disabled" aria-hidden />
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
            <p className="py-8 text-center text-[13px] text-text-muted">
              No library matches yet — try different wording.
            </p>
          ) : (
            <ul className="space-y-2">
              {ranked.map(({ entry, score }) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border-default px-3 py-2.5 hover:border-primary-200 hover:bg-primary-50 dark:hover:bg-primary-900/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-[13px] text-text-primary">{entry.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5"
                          >
                            <Tag size={9} aria-hidden /> {tag}
                          </span>
                        ))}
                        {score > 0 ? (
                          <span className="ml-auto text-[10px] tabular-nums text-text-disabled">
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

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-muted/40 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
