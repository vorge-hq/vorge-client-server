// P3 · (g) — client flip DoD (test-specs §P3 "Client flip"). Proves the section
// save seam: in PROD mode a section edit fires the live PUT with the lockVersion
// the client read and a 409 renders the exact "modified by another user — reload"
// copy; in DEMO mode nothing hits the network (fixtures only), asserted with a
// fetch spy.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { ExecutiveSummarySection } from "./ExecutiveSummarySection";

const ASSESSMENT = { id: "aid-123", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderSection() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <ExecutiveSummarySection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function editAndBlur() {
  const user = userEvent.setup();
  renderSection();
  const textarea = screen.getByPlaceholderText(/Draft an executive summary/);
  await user.click(textarea);
  await user.type(textarea, "Residual risk is concentrated in Section 6.");
  await user.tab(); // blur → save
  return textarea;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("a section edit fires PUT /sections/1 with the lockVersion the client read", async () => {
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ section: { sectionNumber: 1, contentText: "x" }, lockVersion: 2 })
    });

    await editAndBlur();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain(`/api/assessments/${ASSESSMENT.id}/sections/1`);
    expect(options.method).toBe("PUT");
    const body = JSON.parse(options.body);
    expect(body.lockVersion).toBe(1);
    expect(body.contentText).toContain("Residual risk");
    // Success path: no conflict affordance rendered.
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });

  test("a 409 renders the exact 'modified by another user — reload' affordance", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    });

    await editAndBlur();

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("a section edit fires NO network request (fixtures only)", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({}) });

    await editAndBlur();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
