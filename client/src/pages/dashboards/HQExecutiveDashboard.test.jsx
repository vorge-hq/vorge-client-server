// P4 · O7 — the HQ "Cross-facility AI flags" panel (§9.3), which until O7 rendered
// a hardcoded array. Proves the prod↔demo seam per docs/test-specs.md §P3 "Client
// flip": prod calls the read surface and renders the returned rows; demo keeps
// fixtures and fires ZERO fetches (fetch spy).
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HQExecutiveDashboard } from "./HQExecutiveDashboard";
import { WorkspaceProvider } from "../../features/assessmentWorkspace/WorkspaceContext";
import { AuthProvider } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";

const HQ_SESSION = {
  user: { id: "u-hq", name: "HQ Exec", email: "hq@example.com" },
  actingRole: ROLES.HQ_EXECUTIVE,
  roles: [ROLES.HQ_EXECUTIVE]
};

// One flag as the server returns it (the nightly job's row shape).
const SERVER_FLAG = {
  id: "flag-1",
  facilityId: "fac-3",
  facilityName: "Gulf Horizon Terminal",
  assessmentId: "a-1",
  evaluationId: "e-1",
  clusterKey: "maritime::jetty",
  severity: "high",
  divergenceSigma: 3.771,
  rationale: "Maritime rated far below peers; the stated rationale does not explain the gap. Worth review.",
  status: "pending"
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={HQ_SESSION}>
        <WorkspaceProvider>
          <HQExecutiveDashboard />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("HQ consistency flags panel — prod mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
  });

  test("fetches pending flags and renders the facility, sigma and AI rationale", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ flags: [SERVER_FLAG] })
    });

    renderDashboard();

    // The facility name also appears in the heatmap and the facilities table, so
    // assert it inside the flag row rather than page-wide.
    const rationale = await screen.findByText(SERVER_FLAG.rationale);
    const row = rationale.closest("div.min-w-0");
    expect(within(row).getByText("Gulf Horizon Terminal")).toBeTruthy();
    expect(within(row).getByText("3.771σ from peers")).toBeTruthy();

    const called = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(called.some((url) => url.includes("/api/assessments/consistency-flags?status=pending"))).toBe(true);
  });

  test("a failed flags read degrades to a message, not a broken dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    renderDashboard();

    expect(await screen.findByText("Flags are unavailable right now.")).toBeTruthy();
    // The rest of the dashboard still renders.
    expect(screen.getByText("Cross-facility AI flags")).toBeTruthy();
  });

  test("an empty portfolio renders the no-outliers state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ flags: [] })
    });

    renderDashboard();

    expect(await screen.findByText("No outliers flagged across the portfolio.")).toBeTruthy();
  });
});

describe("HQ consistency flags panel — demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
  });

  test("renders fixture flags and fires NO fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderDashboard();

    expect(await screen.findByText(/Gulf Horizon Terminal rated Maritime as Low/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
