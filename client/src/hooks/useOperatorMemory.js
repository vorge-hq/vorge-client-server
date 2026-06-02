import { useCallback, useEffect, useMemo, useState } from "react";
import { OPERATOR_MEMORY_PREFIX as KEY_PREFIX } from "../config/storageKeys";

/**
 * useOperatorMemory
 *
 * Tenant-safe browser-local recall of facility/site values for autocomplete.
 *
 * Why this exists:
 *  - When a user creates new assessments or fills in Section 2 (Facility /
 *    Asset Information), they often re-enter the same facility names,
 *    regions, accountable managers, etc. We want to suggest values they
 *    (or their colleagues at the same operator) have entered before.
 *
 * Tenant safety:
 *  - All reads/writes are keyed by operatorId, so values entered by one
 *    customer can never appear in another customer's autocomplete.
 *  - When the backend lands, swap this hook for an API call scoped by
 *    the server's operator_id claim. Call sites do not need to change.
 *
 * Storage shape (per operator):
 *  {
 *    facilities: [
 *      { name, region, location, type, manager, regulator,
 *        recordedAt: ISO timestamp }
 *    ]
 *  }
 *
 * Suggestions are derived per-field by deduping recent values, ordered
 * most-recent-first. The history is capped at HISTORY_CAP entries so
 * localStorage doesn't grow unbounded.
 */

const HISTORY_CAP = 20;
const KEY_SUFFIX = ":siteHistory";

const FACILITY_FIELDS = ["name", "region", "location", "type", "manager", "regulator"];

function storageKey(operatorId) {
  return `${KEY_PREFIX}${operatorId}${KEY_SUFFIX}`;
}

function readStored(operatorId) {
  if (!operatorId || typeof window === "undefined") return { facilities: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId));
    if (!raw) return { facilities: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.facilities)) return { facilities: [] };
    return { facilities: parsed.facilities };
  } catch {
    /* malformed JSON or quota error — start empty rather than crash */
    return { facilities: [] };
  }
}

function writeStored(operatorId, value) {
  if (!operatorId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(operatorId), JSON.stringify(value));
  } catch {
    /* ignore (private mode, quota exceeded) */
  }
}

function dedupeAndCap(facilities) {
  const seen = new Set();
  const result = [];
  for (const entry of facilities) {
    const key = (entry.name || "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
    if (result.length >= HISTORY_CAP) break;
  }
  return result;
}

export function useOperatorMemory(operatorId) {
  const [memory, setMemory] = useState(() => readStored(operatorId));

  /* Refresh from storage when the operator context changes. This handles
     role switching in the demo (different facility, same browser tab). */
  useEffect(() => {
    setMemory(readStored(operatorId));
  }, [operatorId]);

  const recordFacility = useCallback(
    (input) => {
      if (!operatorId) return;
      const trimmed = {};
      FACILITY_FIELDS.forEach((field) => {
        if (input?.[field] != null && String(input[field]).trim() !== "") {
          trimmed[field] = String(input[field]).trim();
        }
      });
      if (!trimmed.name) return;
      const next = {
        facilities: dedupeAndCap([
          { ...trimmed, recordedAt: new Date().toISOString() },
          ...memory.facilities
        ])
      };
      setMemory(next);
      writeStored(operatorId, next);
    },
    [operatorId, memory]
  );

  const suggestionsFor = useCallback(
    (field) => {
      if (!FACILITY_FIELDS.includes(field)) return [];
      const seen = new Set();
      const result = [];
      for (const entry of memory.facilities) {
        const value = entry?.[field];
        if (value == null) continue;
        const trimmed = String(value).trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
      }
      return result;
    },
    [memory]
  );

  const facilityNames = useMemo(() => suggestionsFor("name"), [suggestionsFor]);

  const clear = useCallback(() => {
    if (!operatorId) return;
    setMemory({ facilities: [] });
    writeStored(operatorId, { facilities: [] });
  }, [operatorId]);

  return {
    facilities: memory.facilities,
    facilityNames,
    suggestionsFor,
    recordFacility,
    clear
  };
}

export default useOperatorMemory;
