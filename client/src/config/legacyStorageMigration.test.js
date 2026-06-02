import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { migrateLegacyStorageKeys } from "./legacyStorageMigration";

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    get length() {
      return Object.keys(store).length;
    },
    key(i) {
      return Object.keys(store)[i] ?? null;
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
    _snapshot() {
      return { ...store };
    }
  };
}

afterEach(() => {
  // nothing global to clean; each test uses its own fake storage
});

describe("migrateLegacyStorageKeys", () => {
  test("migrates the four scalar legacy keys and drops old entries", () => {
    const storage = fakeStorage({
      "vantage.session": "{}",
      "vantage.session.token": "t",
      "vantage-theme": "dark",
      "vantage:demo:mobile-gate-dismissed": "1"
    });
    migrateLegacyStorageKeys(storage);
    expect(storage._snapshot()).toEqual({
      "vorge.session": "{}",
      "vorge.session.token": "t",
      "vorge-theme": "dark",
      "vorge:demo:mobile-gate-dismissed": "1"
    });
  });

  test("does NOT overwrite an existing vorge.* value", () => {
    const storage = fakeStorage({
      "vantage-theme": "dark",
      "vorge-theme": "light"
    });
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem("vorge-theme")).toBe("light");
    expect(storage.getItem("vantage-theme")).toBeNull();
  });

  test("migrates per-operator memory entries by prefix", () => {
    const storage = fakeStorage({
      "vantage:op:op-a:siteHistory": "[1]",
      "vantage:op:op-b:siteHistory": "[2]"
    });
    migrateLegacyStorageKeys(storage);
    expect(storage.getItem("vorge:op:op-a:siteHistory")).toBe("[1]");
    expect(storage.getItem("vorge:op:op-b:siteHistory")).toBe("[2]");
    expect(storage.getItem("vantage:op:op-a:siteHistory")).toBeNull();
    expect(storage.getItem("vantage:op:op-b:siteHistory")).toBeNull();
  });

  test("is idempotent (no-op on second run)", () => {
    const storage = fakeStorage({ "vantage-theme": "dark" });
    migrateLegacyStorageKeys(storage);
    const after = storage._snapshot();
    migrateLegacyStorageKeys(storage);
    expect(storage._snapshot()).toEqual(after);
  });

  test("no-ops when storage is null", () => {
    expect(() => migrateLegacyStorageKeys(null)).not.toThrow();
  });
});
