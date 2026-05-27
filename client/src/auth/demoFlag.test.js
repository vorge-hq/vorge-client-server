import { afterEach, describe, expect, test, vi } from "vitest";
import { isDemoEnabled } from "./demoFlag";
import { getDemoPersona, ROLES } from "./session";

describe("isDemoEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns true only when VITE_ENABLE_DEMO is the string 'true'", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    expect(isDemoEnabled()).toBe(true);
  });

  test("returns false when unset", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "");
    expect(isDemoEnabled()).toBe(false);
  });

  test("returns false for the string 'false'", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    expect(isDemoEnabled()).toBe(false);
  });

  test("returns false for casings other than lowercase 'true'", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "TRUE");
    expect(isDemoEnabled()).toBe(false);
  });
});

describe("demo persona leak alarm", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("getDemoPersona throws when the demo flag is off", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    expect(() => getDemoPersona(ROLES.AUTHOR)).toThrow(/Demo persona accessed/);
  });

  test("getDemoPersona returns the persona when the demo flag is on", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    expect(getDemoPersona(ROLES.AUTHOR)).toMatchObject({ userId: "user-demo-author" });
  });
});
