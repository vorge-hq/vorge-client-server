// P3 · (g) reads — the assessments list hydrates from the live, server-scoped
// API in prod (no client-side per-user role narrowing; decision 2026-07-03), and
// fires NO request in demo mode (fixtures). Server rows are mapped through the
// adapter (cycle/completion/version defaulted).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { WorkspaceProvider } from "../../features/assessmentWorkspace/WorkspaceContext";
import { DEMO_SESSION } from "../../auth/session";
import { AssessmentsListPage } from "./AssessmentsListPage";

const SERVER_ROWS = [
  { id: "srv-a", name: "Live Terminal Alpha — 2027 SRA", facilityId: "fac-1", facilityName: "Alpha Facility", state: "Draft", lockVersion: 3, leadAuthorUserId: "u1", contributors: [], lastUpdated: "2027-01-02T10:00:00Z" },
  { id: "srv-b", name: "Live Terminal Beta — 2027 SRA", facilityId: "fac-9", facilityName: "Beta Facility", state: "In Review", lockVersion: 1, leadAuthorUserId: "u2", contributors: [], lastUpdated: "2027-01-01T10:00:00Z" }
];

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderList() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <AssessmentsListPage />
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

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("hydrates the list from GET /api/assessments and renders the live rows", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ assessments: SERVER_ROWS }) });
    renderList();

    expect(await screen.findByText("Live Terminal Alpha — 2027 SRA")).toBeTruthy();
    expect(screen.getByText("Live Terminal Beta — 2027 SRA")).toBeTruthy();
    // A demo fixture must NOT appear — the list came from the server, not fixtures.
    expect(screen.queryByText("Eko Petrochemical Hub — 2026 SRA")).toBeNull();

    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/assessments");
    // Adapter derived the cycle from the name.
    expect(screen.getAllByText(/Cycle 2027/).length).toBeGreaterThan(0);
  });

  test("a failed load renders an error affordance, not a crash", async () => {
    mockFetch({ ok: false, status: 500, json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }) });
    renderList();
    expect(await screen.findByText(/Could not load assessments|boom/)).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("uses fixtures and fires NO network request", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ assessments: SERVER_ROWS }) });
    renderList();

    expect(await screen.findByText("All assessments")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
    // Server rows must NOT leak into the demo view.
    expect(screen.queryByText("Live Terminal Alpha — 2027 SRA")).toBeNull();
  });
});
