// §Guest read-only access · G4 — G-R5: demo mode is unaffected by the new Guest
// role. The demo role-picker still offers exactly the six pre-existing roles
// (no Guest), canDemoSwitchToRole rejects Guest even in a demo session, and the
// demo login surface fires zero network calls. Plan: docs/plans/guest-viewer-execution-plan.md.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { WorkspaceProvider } from "../../features/assessmentWorkspace/WorkspaceContext";
import { ROLES, demoSession, canDemoSwitchToRole } from "../../auth/session";
import { LoginPage } from "./LoginPage";

const SIX_ROLES = [
  ROLES.AUTHOR,
  ROLES.REVIEWER,
  ROLES.APPROVER,
  ROLES.HQ_EXECUTIVE,
  ROLES.ADMIN,
  ROLES.MITIGATION_OWNER
];

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_DEMO", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("§Guest — demo hygiene (G-R5)", () => {
  test("the demo role-picker shows exactly the six pre-existing roles, never Guest", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const user = (await import("@testing-library/user-event")).default.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <LoginPage />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Advance from the credentials stage to the role picker.
    await user.click(screen.getByRole("button", { name: /demo bypass/i }));

    for (const role of SIX_ROLES) {
      expect(screen.getByText(role)).toBeTruthy();
    }
    expect(screen.queryByText(ROLES.GUEST)).toBeNull(); // "Guest" never offered
    expect(fetchFn).not.toHaveBeenCalled(); // demo surface is offline
  });

  test("canDemoSwitchToRole rejects Guest even in a demo session", () => {
    expect(canDemoSwitchToRole(demoSession, ROLES.GUEST)).toBe(false);
    // sanity: a real demo persona still switches
    expect(canDemoSwitchToRole(demoSession, ROLES.AUTHOR)).toBe(true);
  });
});
