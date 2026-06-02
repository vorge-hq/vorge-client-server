import {
  SESSION_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  THEME_STORAGE_KEY,
  DEMO_GATE_DISMISSED_KEY,
  OPERATOR_MEMORY_PREFIX,
  LEGACY_KEYS
} from "./storageKeys.js";

const SCALAR_PAIRS = [
  [LEGACY_KEYS.session, SESSION_STORAGE_KEY],
  [LEGACY_KEYS.sessionToken, TOKEN_STORAGE_KEY],
  [LEGACY_KEYS.theme, THEME_STORAGE_KEY],
  [LEGACY_KEYS.demoGateDismissed, DEMO_GATE_DISMISSED_KEY]
];

/* One-shot, idempotent migration of localStorage keys from the
   "vantage.*" namespace to "vorge.*". Runs at app boot before any
   consumer reads the new keys. Safe to run repeatedly; safe to run on
   browsers that have neither set; never throws — storage may be
   inaccessible (private mode, disabled, quota). */
export function migrateLegacyStorageKeys(
  storage = typeof window !== "undefined" ? window.localStorage : null
) {
  if (!storage) return;
  try {
    for (const [oldKey, newKey] of SCALAR_PAIRS) {
      if (storage.getItem(newKey) == null) {
        const legacy = storage.getItem(oldKey);
        if (legacy != null) storage.setItem(newKey, legacy);
      }
      storage.removeItem(oldKey);
    }
    /* Operator memory uses a prefix with arbitrary suffix (per-operator
       state). Iterate once, copy any vantage:op:* key whose vorge:op:*
       counterpart isn't already set, then drop the legacy entry. */
    const legacyOperatorKeys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_KEYS.operatorMemoryPrefix)) {
        legacyOperatorKeys.push(key);
      }
    }
    for (const legacyKey of legacyOperatorKeys) {
      const suffix = legacyKey.slice(LEGACY_KEYS.operatorMemoryPrefix.length);
      const newKey = OPERATOR_MEMORY_PREFIX + suffix;
      if (storage.getItem(newKey) == null) {
        storage.setItem(newKey, storage.getItem(legacyKey));
      }
      storage.removeItem(legacyKey);
    }
  } catch {
    // Best effort — never block boot on storage migration.
  }
}
