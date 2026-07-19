// §Guest read-only access · G4 — G-RTL1: Guest role plumbing in the nav/role
// helpers. Pure functions, no render. Plan: docs/plans/guest-viewer-execution-plan.md.
import { describe, expect, test } from "vitest";
import { getNavigationForRole, getHomeRouteForRole } from "./navigation";
import { ROLES, isRoleMfaRequired } from "../../auth/session";

describe("§Guest — navigation + role helpers (G-RTL1)", () => {
  test("Guest has a dashboard nav entry, home = /dashboard, and is MFA-exempt", () => {
    const nav = getNavigationForRole(ROLES.GUEST);
    expect(nav.length).toBeGreaterThan(0); // not the empty-nav fallback
    expect(nav.every((item) => typeof item.to === "string" && typeof item.label === "string")).toBe(true);
    expect(nav[0].to).toBe("/dashboard");
    // No hardcoded fixture deep-link (ACTIVE_ASSESSMENT_ID) leaked into guest nav.
    expect(nav.some((item) => item.to.includes("/assessments/"))).toBe(false);

    expect(getHomeRouteForRole(ROLES.GUEST)).toBe("/dashboard");
    expect(isRoleMfaRequired(ROLES.GUEST)).toBe(false);
  });
});
