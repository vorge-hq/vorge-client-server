import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { WorkspaceProvider } from "../../features/assessmentWorkspace/WorkspaceContext";
import { DEMO_SESSION } from "../../auth/session";
import { AuthorDashboard } from "./AuthorDashboard";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <>
                  <AuthorDashboard />
                  <LocationProbe />
                </>
              }
            />
            <Route
              path="/assessments/:assessmentId/sections/:sectionId"
              element={<LocationProbe />}
            />
          </Routes>
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function findEkoRow() {
  return screen.getByRole("button", { name: /eko petrochemical hub.*2026 sra/i });
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AuthorDashboard — row click navigation", () => {
  test("demo flag OFF: clicking the row body (not the button) navigates to /sections/2", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = userEvent.setup();
    renderDashboard();
    const row = findEkoRow();
    // Click a non-button cell — pick the Name cell.
    const cells = within(row).getAllByRole("cell");
    await user.click(cells[0]);
    expect(screen.getByTestId("location").textContent).toBe(
      "/assessments/ass-1-2026/sections/2"
    );
  });

  test("demo flag ON: clicking the row body navigates to /sections/1", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    renderDashboard();
    const row = findEkoRow();
    const cells = within(row).getAllByRole("cell");
    await user.click(cells[0]);
    expect(screen.getByTestId("location").textContent).toBe(
      "/assessments/ass-1-2026/sections/1"
    );
  });

  test("clicking the inner Open/Resume button navigates once and matches the row target", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = userEvent.setup();
    renderDashboard();
    const row = findEkoRow();
    // The row's inner button has a label that includes an arrow; match by trailing "→".
    const openButton = within(row).getByRole("button", { name: /→/ });
    await user.click(openButton);
    // After click, the route renders only LocationProbe (no row), so the
    // dashboard's buttons unmount. Verify the path is correct.
    expect(screen.getByTestId("location").textContent).toBe(
      "/assessments/ass-1-2026/sections/2"
    );
  });
});

describe("AuthorDashboard — keyboard interactivity", () => {
  test("Enter on focused row navigates", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    renderDashboard();
    const row = findEkoRow();
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe(
      "/assessments/ass-1-2026/sections/2"
    );
  });

  test("Space on focused row navigates and prevents default", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    renderDashboard();
    const row = findEkoRow();
    row.focus();
    const event = fireEvent.keyDown(row, { key: " " });
    // fireEvent returns false when preventDefault was called on the event.
    expect(event).toBe(false);
    expect(screen.getByTestId("location").textContent).toBe(
      "/assessments/ass-1-2026/sections/2"
    );
  });
});

describe("AuthorDashboard — a11y attributes", () => {
  test("row exposes role=button, tabIndex=0, and aria-label referencing the assessment name", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    renderDashboard();
    const row = findEkoRow();
    expect(row.tagName).toBe("TR");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.getAttribute("aria-label")).toMatch(/eko petrochemical hub/i);
  });
});
