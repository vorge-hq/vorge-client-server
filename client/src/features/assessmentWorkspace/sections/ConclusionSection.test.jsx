// P3 · (g) — Conclusion (§8) save seam, mirroring the §1 client-flip DoD: prod
// fires PUT /sections/8 with the lockVersion; a 409 renders the exact reload
// copy; demo fires no fetch.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { ConclusionSection } from "./ConclusionSection";

const ASSESSMENT = { id: "aid-8", state: "Draft", lockVersion: 4, name: "n" };

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function editAndBlur() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <ConclusionSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
  const textarea = screen.getByPlaceholderText(/Conclude the assessment/);
  await user.click(textarea);
  await user.type(textarea, "Residual risk reduced to Medium.");
  await user.tab();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("edit fires PUT /sections/8 with the lockVersion the client read", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ section: {}, lockVersion: 5 }) });
    await editAndBlur();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain(`/api/assessments/${ASSESSMENT.id}/sections/8`);
    expect(JSON.parse(options.body).lockVersion).toBe(4);
  });

  test("a 409 renders the exact reload affordance", async () => {
    mockFetch({ ok: false, status: 409, json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "c" } }) });
    await editAndBlur();
    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("edit fires NO network request", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({}) });
    await editAndBlur();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
