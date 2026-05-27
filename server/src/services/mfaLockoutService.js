/**
 * Geometric backoff state machine for MFA verification failures.
 *
 * Per docs/decisions/chunk-4-mfa.md §Locked decisions #9:
 *   3 fails  → 30s lockout
 *   5 fails  → 5min lockout
 *   7 fails  → 30min lockout
 *   10 fails → 24h lockout, requires admin reset
 *
 * Below 3, no lockout. Counters reset on successful verify.
 */

const TIER_30S = 30 * 1000;
const TIER_5MIN = 5 * 60 * 1000;
const TIER_30MIN = 30 * 60 * 1000;
const TIER_24H = 24 * 60 * 60 * 1000;

/**
 * Compute the lockout duration (in ms) for a given total failure count,
 * starting from 1. Returns 0 if no lockout applies.
 */
function lockoutDurationFor(attempts) {
  if (attempts >= 10) return TIER_24H;
  if (attempts >= 7) return TIER_30MIN;
  if (attempts >= 5) return TIER_5MIN;
  if (attempts >= 3) return TIER_30S;
  return 0;
}

/**
 * Returns the threshold tier name (or null if no lockout), used for audit
 * metadata.
 */
function lockoutTierFor(attempts) {
  if (attempts >= 10) return "24h_admin_reset";
  if (attempts >= 7) return "30min";
  if (attempts >= 5) return "5min";
  if (attempts >= 3) return "30s";
  return null;
}

/**
 * Returns true if the user is currently locked out per their `mfa_locked_until`
 * timestamp. Caller passes the user object.
 */
function isLockedOut(user, now = new Date()) {
  if (!user?.mfaLockedUntil) return false;
  return new Date(user.mfaLockedUntil) > now;
}

function remainingLockoutMs(user, now = new Date()) {
  if (!user?.mfaLockedUntil) return 0;
  const ms = new Date(user.mfaLockedUntil).getTime() - now.getTime();
  return ms > 0 ? ms : 0;
}

/**
 * Compute the new failure state given the current user record and now.
 * Does NOT write to the DB — caller passes the result to
 * `userRepository.updateMfaFailureState`. Pure function for testability.
 *
 * Returns { failedAttempts, lastFailureAt, lockedUntil, tier }.
 */
function nextFailureState(user, now = new Date()) {
  const attempts = (Number(user?.mfaFailedAttempts) || 0) + 1;
  const duration = lockoutDurationFor(attempts);
  return {
    failedAttempts: attempts,
    lastFailureAt: now,
    lockedUntil: duration > 0 ? new Date(now.getTime() + duration) : null,
    tier: lockoutTierFor(attempts),
    durationMs: duration
  };
}

/**
 * On success or admin reset: clear all failure counters.
 */
function clearedState() {
  return {
    failedAttempts: 0,
    lastFailureAt: null,
    lockedUntil: null
  };
}

module.exports = {
  lockoutDurationFor,
  lockoutTierFor,
  isLockedOut,
  remainingLockoutMs,
  nextFailureState,
  clearedState,
  TIER_30S,
  TIER_5MIN,
  TIER_30MIN,
  TIER_24H
};
