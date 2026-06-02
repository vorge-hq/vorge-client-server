/* Centralised localStorage keys for the Vorge client.

   Keys are namespaced with the current brand prefix ("vorge"). Legacy
   "vantage" keys are migrated once on boot by `legacyStorageMigration.js`
   so existing users don't lose state across the rebrand. */

export const SESSION_STORAGE_KEY = "vorge.session";
export const TOKEN_STORAGE_KEY = "vorge.session.token";
export const THEME_STORAGE_KEY = "vorge-theme";
export const DEMO_GATE_DISMISSED_KEY = "vorge:demo:mobile-gate-dismissed";
export const OPERATOR_MEMORY_PREFIX = "vorge:op:";

/* Legacy keys retained only for the migration shim. */
export const LEGACY_KEYS = Object.freeze({
  session: "vantage.session",
  sessionToken: "vantage.session.token",
  theme: "vantage-theme",
  demoGateDismissed: "vantage:demo:mobile-gate-dismissed",
  operatorMemoryPrefix: "vantage:op:"
});
