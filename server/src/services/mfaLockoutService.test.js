const lockout = require("./mfaLockoutService");

describe("mfaLockoutService.lockoutDurationFor", () => {
  test("0-2 attempts: no lockout", () => {
    expect(lockout.lockoutDurationFor(0)).toBe(0);
    expect(lockout.lockoutDurationFor(1)).toBe(0);
    expect(lockout.lockoutDurationFor(2)).toBe(0);
  });

  test("3-4 attempts: 30s", () => {
    expect(lockout.lockoutDurationFor(3)).toBe(lockout.TIER_30S);
    expect(lockout.lockoutDurationFor(4)).toBe(lockout.TIER_30S);
  });

  test("5-6 attempts: 5min", () => {
    expect(lockout.lockoutDurationFor(5)).toBe(lockout.TIER_5MIN);
    expect(lockout.lockoutDurationFor(6)).toBe(lockout.TIER_5MIN);
  });

  test("7-9 attempts: 30min", () => {
    expect(lockout.lockoutDurationFor(7)).toBe(lockout.TIER_30MIN);
    expect(lockout.lockoutDurationFor(9)).toBe(lockout.TIER_30MIN);
  });

  test("10+ attempts: 24h (admin reset tier)", () => {
    expect(lockout.lockoutDurationFor(10)).toBe(lockout.TIER_24H);
    expect(lockout.lockoutDurationFor(50)).toBe(lockout.TIER_24H);
  });
});

describe("mfaLockoutService.lockoutTierFor", () => {
  test("returns the tier name for each threshold", () => {
    expect(lockout.lockoutTierFor(0)).toBeNull();
    expect(lockout.lockoutTierFor(2)).toBeNull();
    expect(lockout.lockoutTierFor(3)).toBe("30s");
    expect(lockout.lockoutTierFor(5)).toBe("5min");
    expect(lockout.lockoutTierFor(7)).toBe("30min");
    expect(lockout.lockoutTierFor(10)).toBe("24h_admin_reset");
  });
});

describe("mfaLockoutService.isLockedOut / remainingLockoutMs", () => {
  test("not locked when mfaLockedUntil is null/undefined", () => {
    expect(lockout.isLockedOut({})).toBe(false);
    expect(lockout.isLockedOut({ mfaLockedUntil: null })).toBe(false);
    expect(lockout.isLockedOut(null)).toBe(false);
  });

  test("locked when mfaLockedUntil is in the future", () => {
    const future = new Date(Date.now() + 60_000);
    expect(lockout.isLockedOut({ mfaLockedUntil: future })).toBe(true);
    expect(lockout.remainingLockoutMs({ mfaLockedUntil: future })).toBeGreaterThan(0);
  });

  test("not locked when mfaLockedUntil is in the past", () => {
    const past = new Date(Date.now() - 60_000);
    expect(lockout.isLockedOut({ mfaLockedUntil: past })).toBe(false);
    expect(lockout.remainingLockoutMs({ mfaLockedUntil: past })).toBe(0);
  });
});

describe("mfaLockoutService.nextFailureState", () => {
  test("increments attempts; no lockout below threshold 3", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    const state = lockout.nextFailureState({ mfaFailedAttempts: 1 }, now);
    expect(state.failedAttempts).toBe(2);
    expect(state.lockedUntil).toBeNull();
    expect(state.tier).toBeNull();
    expect(state.durationMs).toBe(0);
    expect(state.lastFailureAt).toBe(now);
  });

  test("transitions through 3 → 30s lockout", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    const state = lockout.nextFailureState({ mfaFailedAttempts: 2 }, now);
    expect(state.failedAttempts).toBe(3);
    expect(state.tier).toBe("30s");
    expect(state.lockedUntil.getTime() - now.getTime()).toBe(lockout.TIER_30S);
  });

  test("transitions through 5/7/10", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    expect(lockout.nextFailureState({ mfaFailedAttempts: 4 }, now).tier).toBe("5min");
    expect(lockout.nextFailureState({ mfaFailedAttempts: 6 }, now).tier).toBe("30min");
    expect(lockout.nextFailureState({ mfaFailedAttempts: 9 }, now).tier).toBe("24h_admin_reset");
  });

  test("handles undefined / non-numeric input safely", () => {
    expect(lockout.nextFailureState({}).failedAttempts).toBe(1);
    expect(lockout.nextFailureState(null).failedAttempts).toBe(1);
    expect(lockout.nextFailureState({ mfaFailedAttempts: "junk" }).failedAttempts).toBe(1);
  });
});

describe("mfaLockoutService.clearedState", () => {
  test("returns zeroed counters", () => {
    expect(lockout.clearedState()).toEqual({
      failedAttempts: 0,
      lastFailureAt: null,
      lockedUntil: null
    });
  });
});
