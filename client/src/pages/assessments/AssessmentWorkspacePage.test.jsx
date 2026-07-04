// P3 · (g) reads — prod workspace must survive the loading → hydrated re-render
// (Rules of Hooks: useMemo calls cannot sit after early returns).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { WorkspaceProvider } from "../../features/assessmentWorkspace/WorkspaceContext";
import { DEMO_SESSION } from "../../auth/session";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";
import { AssessmentWorkspacePage } from "./AssessmentWorkspacePage";

const ASSESSMENT_ID = "00000000-0000-4000-8000-000000000301";

const BUNDLE = {
  assessment: {
    id: ASSESSMENT_ID,
    name: "Bonny Terminal - 2026 SRA",
    facilityId: "00000000-0000-4000-8000-000000000101",
    facilityName: "Bonny Terminal",
    state: "Draft",
    lockVersion: 1,
    leadAuthorUserId: "00000000-0000-4000-8000-000000000201",
    contributors: [],
    lastUpdated: "2026-07-03T14:03:41.000Z"
  },
  sectionTexts: { 1: "Exec from server" },
  assets: [],
  threats: [],
  links: [],
  evaluations: [],
  mitigations: []
};

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderWorkspace(sectionId = 1) {
  return render(
    <MemoryRouter initialEntries={[`/assessments/${ASSESSMENT_ID}/sections/${sectionId}`]}>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <Routes>
            <Route
              path="/assessments/:assessmentId/sections/:sectionId"
              element={<AssessmentWorkspacePage />}
            />
          </Routes>
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

  test("hydrates from GET /:id without crashing through the loading state", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => BUNDLE });
    renderWorkspace();

    expect(screen.getByText("Loading assessment…")).toBeTruthy();
    expect(await screen.findByText("Bonny Terminal - 2026 SRA")).toBeTruthy();

    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain(`/api/assessments/${ASSESSMENT_ID}`);
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("opens a fixture assessment without a network request", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => BUNDLE });
    render(
      <MemoryRouter initialEntries={[`/assessments/${ACTIVE_ASSESSMENT_ID}/sections/1`]}>
        <AuthProvider initialSession={DEMO_SESSION}>
          <WorkspaceProvider>
            <Routes>
              <Route
                path="/assessments/:assessmentId/sections/:sectionId"
                element={<AssessmentWorkspacePage />}
              />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText("Eko Petrochemical Hub — 2026 SRA")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
