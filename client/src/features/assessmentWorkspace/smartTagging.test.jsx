// P4 · O4 — smart-tagging prod↔demo seam. PROD hits the evaluation-scoped tag
// endpoints; DEMO fires NO request (canned suggestions, local confirm echo).
// Fetch-spy, mirroring the per-section seam suites.
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { DEMO_SESSION, ROLES } from "../../auth/session";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

const EVAL_ID = "11111111-2222-4333-8444-555555555555";

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function Harness() {
  const ws = useWorkspace();
  const [out, setOut] = useState(null);
  return (
    <div>
      <button
        type="button"
        onClick={async () => setOut(await ws.suggestScenarioTags(EVAL_ID, ROLES.AUTHOR))}
      >
        suggest
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await ws.confirmScenarioTags(
            EVAL_ID,
            [{ category: "threat_type", value: "Insider", source: "ai" }],
            ROLES.AUTHOR
          );
          setOut(res.tags);
        }}
      >
        confirm
      </button>
      <output>{out ? `tags:${out.map((t) => t.value).join(",")}` : "idle"}</output>
    </div>
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

describe("smart-tagging seam", () => {
  test("prod: suggest fires POST /suggest-tags and returns the server tags", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ tags: [{ category: "threat_type", value: "Insider", source: "ai", status: "suggested" }] })
    });
    renderHarness();

    await user.click(screen.getByRole("button", { name: "suggest" }));

    expect(await screen.findByText("tags:Insider")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain(`/api/assessments/`);
    expect(url).toContain(`/evaluations/${EVAL_ID}/suggest-tags`);
    expect(opts.method).toBe("POST");
  });

  test("prod: confirm fires POST /tags/confirm with the chosen set", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ tags: [{ category: "threat_type", value: "Insider", source: "ai", status: "confirmed" }] })
    });
    renderHarness();

    await user.click(screen.getByRole("button", { name: "confirm" }));

    expect(await screen.findByText("tags:Insider")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain(`/evaluations/${EVAL_ID}/tags/confirm`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body).tags).toEqual([{ category: "threat_type", value: "Insider", source: "ai" }]);
  });

  test("demo: suggest fires NO request and returns canned AI tags", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ tags: [] }) });
    renderHarness();

    await user.click(screen.getByRole("button", { name: "suggest" }));

    await screen.findByText(/tags:/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByText(/tags:Insider/)).toBeTruthy();
  });

  test("demo: confirm fires NO request", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ tags: [] }) });
    renderHarness();

    await user.click(screen.getByRole("button", { name: "confirm" }));

    expect(await screen.findByText("tags:Insider")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
