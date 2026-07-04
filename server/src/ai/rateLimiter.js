// P4 · O2 — per-scope (facility/operator) rate limit for AI calls. In-memory
// fixed-window counter; a multi-instance deployment needs the same Redis swap
// as middleware/rateLimit.js:13 (tracked in lockbox) — same caveat, same
// abstraction shape so the swap is uniform.
//
// runAiCall calls check(scopeKey) BEFORE the gateway; exceeding the window
// throws a rate-limited DomainError which runAiCall audits (outcome
// 'rate_limited') like every other terminal state. In test mode the ceiling is
// raised so the integration/unit suites (one shared scope across many calls)
// don't trip it; individual tests spy on check() to exercise the audit path.
const env = require("../config/env");

const WINDOW_MS = 60 * 1000;
const isTest = env.nodeEnv === "test";
const MAX_PER_WINDOW = isTest ? 100000 : 30;

// scopeKey -> { count, windowStart }
const buckets = new Map();

function check(scopeKey, now = Date.now()) {
  const key = scopeKey || "anonymous";
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    const err = new Error("AI rate limit exceeded");
    err.rateLimited = true;
    throw err;
  }
}

// Test seam: clear window state between cases.
function reset() {
  buckets.clear();
}

module.exports = { check, reset, WINDOW_MS, MAX_PER_WINDOW };
