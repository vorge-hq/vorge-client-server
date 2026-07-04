// Prod dashboard hydration: the dashboards render from the in-memory
// `assessmentsById` store. In prod that store must be populated from the live,
// server-scoped list (fixtures carry demo ids that never match a real session),
// and the per-user client narrowing must be skipped (the list API returns no
// reviewer/approver ids). This covers both halves.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { DEMO_SESSION } from "../../auth/session";
import { ROLES } from "../../auth/session";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { filterAssessmentsForRole } from "./assessmentModel";

const SERVER_ROWS = [
  { id: "srv-a", name: "Live Terminal Alpha — 2027 SRA", facilityId: "fac-1", state: "Draft", lockVersion: 3, leadAuthorUserId: "u1", contributors: [], lastUpdated: "2027-01-02T10:00:00Z" },
  { id: "srv-b", name: "Live Terminal Beta — 2027 SRA", facilityId: "fac-9", state: "In Review", lockVersion: 1, leadAuthorUserId: "u2", contributors: [], lastUpdated: "2027-01-01T10:00:00Z" }
];

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Harness: hydrate on mount, then print the store's assessment names.
function Harness() {
  const workspace = useWorkspace();
  return (
    <button type="button" onClick={() => workspace.hydrateAssessmentsList(ROLES.AUTHOR)}>
      {"names:" + Object.values(workspace.assessmentsById).map((a) => a.name).join("|")}
    </button>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <Harness />
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

describe("hydrateAssessmentsList", () => {
  test("prod: fetches GET /api/assessments and REPLACES the store with live rows", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ assessments: SERVER_ROWS }) });
    renderHarness();

    await user.click(screen.getByRole("button"));

    const btn = await screen.findByText(/Live Terminal Alpha/);
    expect(btn.textContent).toContain("Live Terminal Alpha — 2027 SRA");
    expect(btn.textContent).toContain("Live Terminal Beta — 2027 SRA");
    // Fixtures were replaced, not merged.
    expect(btn.textContent).not.toContain("Eko Petrochemical Hub");
    expect(fetchFn.mock.calls[0][0]).toContain("/api/assessments");
  });

  test("demo: fires NO request and keeps the fixture store", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ assessments: SERVER_ROWS }) });
    renderHarness();

    await user.click(screen.getByRole("button"));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByRole("button").textContent).not.toContain("Live Terminal Alpha");
  });
});

describe("filterAssessmentsForRole serverScoped", () => {
  const rows = [
    { id: "1", facilityId: "fac-1", leadAuthorUserId: "me", state: "Draft" },
    { id: "2", facilityId: "fac-1", leadAuthorUserId: "someone-else", state: "In Review" },
    { id: "3", facilityId: "fac-off", leadAuthorUserId: "me", state: "Draft" }
  ];
  const ctx = { actingRole: ROLES.AUTHOR, userId: "me", accessibleFacilityIds: ["fac-1"] };

  test("default (demo): narrows to the acting user's own rows within facility", () => {
    const out = filterAssessmentsForRole(ctx, rows);
    expect(out.map((r) => r.id)).toEqual(["1"]); // #2 not mine, #3 off-facility
  });

  test("serverScoped (prod): keeps every in-facility row, skips per-user narrowing", () => {
    const out = filterAssessmentsForRole(ctx, rows, { serverScoped: true });
    expect(out.map((r) => r.id)).toEqual(["1", "2"]); // both in fac-1; #3 still off-facility
  });
});
