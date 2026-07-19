// §Guest read-only access · G4 — G-RTL2 (read-only shell, no write affordances)
// and G-RTL3 (prod guest fires REAL reads, not demo fixtures).
// Patterns: dashboardHydration.test.jsx (fetch-spy + hydrate) + mfa.test.jsx
// (session factory). Plan: docs/plans/guest-viewer-execution-plan.md.
import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { WorkspaceProvider, useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { GuestDashboard } from "./GuestDashboard";

const GUEST_SESSION = {
  user: { id: "guest-1", name: "Vorge Guest" },
  facility: { id: "fac-guest", name: "Bonny Terminal", operatorId: "op-a" },
  facilities: [{ id: "fac-guest", name: "Bonny Terminal", operatorId: "op-a" }],
  actingRole: ROLES.GUEST,
  roles: [ROLES.GUEST],
  token: "guest-token",
  mfaSatisfied: true
};

const GUEST_ROWS = [
  { id: "asmt-1", name: "Bonny Terminal — 2026 SRA", facilityId: "fac-guest", state: "In Review", lockVersion: 1, leadAuthorUserId: "u1", contributors: [], lastUpdated: "2026-07-01T10:00:00Z" }
];

function ok(body, status = 200) {
  return { ok: true, status, json: async () => body };
}

function mockFetch(responder) {
  const fn = vi.fn(responder);
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Hydrate once on mount (as AppShell does in the real app), then render the
// guest dashboard from the populated store.
function GuestApp() {
  const workspace = useWorkspace();
  useEffect(() => {
    workspace.hydrateAssessmentsList(ROLES.GUEST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <GuestDashboard />;
}

function renderGuest() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={GUEST_SESSION}>
        <WorkspaceProvider>
          <GuestApp />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const WRITE_AFFORDANCE = /submit|create|new assessment|approve|reject|send back|edit|delete|save|export/i;

describe("§Guest — GuestDashboard (G-RTL2, G-RTL3)", () => {
  test("G-RTL2 renders read-only rows with NO write/submit/queue affordances", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    mockFetch(async () => ok({ assessments: GUEST_ROWS }));
    renderGuest();

    // A row rendered → the guest can open assessments.
    const view = await screen.findByRole("button", { name: /view/i });
    expect(view).toBeTruthy();
    expect(screen.getAllByText(/Bonny Terminal/).length).toBeGreaterThan(0);

    // No write/submit/queue-action control anywhere on the guest dashboard.
    expect(screen.queryByRole("button", { name: WRITE_AFFORDANCE })).toBeNull();
  });

  test("G-RTL3 prod guest fires a REAL GET /api/assessments and NO mutating fetch", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const fetchFn = mockFetch(async () => ok({ assessments: GUEST_ROWS }));
    renderGuest();

    await screen.findByRole("button", { name: /view/i });

    const readCalls = fetchFn.mock.calls.filter(([url]) => String(url).includes("/api/assessments"));
    expect(readCalls.length).toBeGreaterThan(0); // guest is NOT demo — reads hit the network
    // Every call the guest dashboard made is a read (no POST/PUT/PATCH/DELETE).
    const mutating = fetchFn.mock.calls.filter(([, opts]) =>
      ["POST", "PUT", "PATCH", "DELETE"].includes(opts?.method)
    );
    expect(mutating).toHaveLength(0);
  });
});
