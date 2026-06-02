import { isDemoEnabled } from "../../auth/demoFlag";
import { DEMO_GATE_DISMISSED_KEY as DISMISSED_STORAGE_KEY } from "../../config/storageKeys";

export { DISMISSED_STORAGE_KEY };
export const MOBILE_BREAKPOINT = 1024;

export function computeInitialDismissed(deps = {}) {
  const hasWindow = typeof window !== "undefined";
  // Use property-existence checks (not destructuring defaults) so callers can
  // explicitly inject `viewportWidth: undefined` to exercise the SSR branch.
  const demoEnabled = "demoEnabled" in deps ? deps.demoEnabled : isDemoEnabled();
  const storage = "storage" in deps
    ? deps.storage
    : hasWindow
      ? window.sessionStorage
      : null;
  const viewportWidth = "viewportWidth" in deps
    ? deps.viewportWidth
    : hasWindow
      ? window.innerWidth
      : undefined;

  if (viewportWidth === undefined) return true;
  if (!demoEnabled) return true;
  if (viewportWidth >= MOBILE_BREAKPOINT) return true;
  if (storage && safeRead(storage, DISMISSED_STORAGE_KEY)) return true;
  return false;
}

function safeRead(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
