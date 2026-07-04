// P4 · O4 — Smart tagging chips for the Section-6 scenario (§9.6). After the
// Author saves a scenario, "Suggest tags" asks the AI service for 2–4 tags from
// the facility's controlled vocabulary (out-of-vocab already discarded
// server-side). Suggestions render as "AI-suggested" chips the Author can keep,
// remove, or augment with a manual tag; an explicit Confirm — or a 30-second
// timeout (§9.6) — persists the chosen set. All I/O goes through the
// WorkspaceContext prod↔demo seam, so demo mode fires no fetch.
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { isDemoEnabled } from "../../../auth/demoFlag";
import { useAuth } from "../../../auth/AuthContext";
import { useWorkspace } from "../WorkspaceContext";

// §9.6 auto-confirm window. Exported so tests can drive it with fake timers.
export const AUTO_CONFIRM_MS = 30000;

const TAG_CATEGORIES = [
  { key: "threat_type", label: "Threat type" },
  { key: "asset_class", label: "Asset class" },
  { key: "region", label: "Region" },
  { key: "consequence_category", label: "Consequence" }
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tagKey = (t) => `${t.category}::${t.value}`;

export function ScenarioTags({ evaluationId, canEdit, autoConfirmMs = AUTO_CONFIRM_MS }) {
  const { session } = useAuth();
  const { loadScenarioTags, suggestScenarioTags, confirmScenarioTags, showToast } = useWorkspace();
  const actingRole = session.actingRole;

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manualCategory, setManualCategory] = useState("threat_type");
  const [manualValue, setManualValue] = useState("");
  // `dirty` = the working set differs from what's persisted, so Confirm is
  // enabled even when every remaining chip is already `confirmed` (e.g. the
  // Author just removed one) and even for an empty set. `dirtyRef` mirrors it
  // for async callbacks that can't read fresh state.
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);
  const markClean = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  // Auto-confirm timer + a live view of the working set for it to persist.
  const timerRef = useRef(null);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  // Only a persisted evaluation (server UUID) can be tagged; a not-yet-saved
  // stub has no server row. Demo ids are fixtures, so demo is always taggable.
  const taggable = isDemoEnabled() || UUID_RE.test(String(evaluationId || ""));

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Hydrate any already-persisted tags when the focused evaluation changes. A
  // slow load must NOT clobber chips the Author has meanwhile acted on, so the
  // resolve is dropped once the working set is dirty (dirtyRef), not just on
  // unmount (cancelled).
  useEffect(() => {
    let cancelled = false;
    markClean();
    if (!evaluationId) {
      setTags([]);
      return undefined;
    }
    loadScenarioTags(evaluationId, actingRole)
      .then((loaded) => {
        if (!cancelled && !dirtyRef.current) setTags(loaded || []);
      })
      .catch(() => {
        if (!cancelled && !dirtyRef.current) setTags([]);
      });
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [evaluationId, actingRole, loadScenarioTags, clearTimer, markClean]);

  const persist = useCallback(
    async (working) => {
      clearTimer();
      try {
        const res = await confirmScenarioTags(evaluationId, working, actingRole);
        // A no-op response (no active assessment) leaves the working set intact.
        if (res && res.ok === false) return;
        setTags(res.tags || []);
        markClean();
      } catch (error) {
        showToast(error.message || "Could not save tags", { tone: "error" });
      }
    },
    [clearTimer, confirmScenarioTags, evaluationId, actingRole, showToast, markClean]
  );

  async function handleSuggest() {
    if (!taggable) return;
    setLoading(true);
    try {
      const suggested = await suggestScenarioTags(evaluationId, actingRole);
      // Merge onto the confirmed/manual chips already present; suggestions never
      // replace a tag the Author has already acted on.
      const have = new Set(tagsRef.current.map(tagKey));
      const merged = [...tagsRef.current, ...(suggested || []).filter((t) => !have.has(tagKey(t)))];
      setTags(merged);
      markDirty();
      clearTimer();
      if ((suggested || []).length > 0) {
        timerRef.current = setTimeout(() => persist(tagsRef.current), autoConfirmMs);
      }
    } catch (error) {
      showToast(error.message || "Could not suggest tags", { tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  function handleRemove(key) {
    clearTimer();
    markDirty();
    setTags((prev) => prev.filter((t) => tagKey(t) !== key));
  }

  function handleAddManual() {
    const value = manualValue.trim();
    if (!value) return;
    const candidate = { category: manualCategory, value, source: "manual", status: "suggested" };
    clearTimer();
    markDirty();
    setTags((prev) => (prev.some((t) => tagKey(t) === tagKey(candidate)) ? prev : [...prev, candidate]));
    setManualValue("");
  }

  if (!taggable && tags.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded-md border border-border-default bg-surface-muted/40 p-2.5" data-testid="scenario-tags">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles size={10} className="text-primary dark:text-primary-300" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Tags</span>
        {canEdit && taggable ? (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="ml-auto rounded border border-border-default px-2 py-0.5 text-[10px] font-medium text-text-secondary hover:bg-surface-base disabled:opacity-60"
          >
            {loading ? "Suggesting…" : "Suggest tags"}
          </button>
        ) : null}
      </div>

      {tags.length === 0 ? (
        <p className="text-[11px] italic text-text-disabled">No tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const isSuggested = t.status !== "confirmed";
            return (
              <span
                key={tagKey(t)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  isSuggested
                    ? "border-dashed border-primary-300 bg-primary-50 text-primary dark:border-primary-700 dark:bg-primary-900/60 dark:text-primary-200"
                    : "border-border-default bg-surface-base text-text-secondary"
                }`}
              >
                {t.value}
                {isSuggested ? (
                  <span className="text-[9px] uppercase tracking-wide opacity-70" aria-label="AI-suggested">
                    AI
                  </span>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(tagKey(t))}
                    aria-label={`Remove ${t.value}`}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X size={10} aria-hidden />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      )}

      {canEdit && taggable ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            value={manualCategory}
            onChange={(event) => setManualCategory(event.target.value)}
            aria-label="Tag category"
            className="rounded border border-border-default bg-surface-base px-1.5 py-1 text-[11px]"
          >
            {TAG_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddManual();
              }
            }}
            placeholder="Add tag…"
            aria-label="Manual tag value"
            className="w-28 rounded border border-border-default bg-surface-base px-1.5 py-1 text-[11px] focus:border-border-focus focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddManual}
            className="rounded border border-border-default px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-base"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => persist(tags)}
            disabled={!dirty}
            className="ml-auto rounded bg-primary px-2 py-1 text-[10px] font-semibold text-text-inverse hover:opacity-90 disabled:opacity-50"
          >
            Confirm tags
          </button>
        </div>
      ) : null}
    </div>
  );
}
