// P4 · O3 — the LibraryModal search seam. PROD embeds + cosine-ranks server-side
// (GET /api/library/search); DEMO ranks the scenario fixtures locally and fires
// NO request. Fetch-spy, mirroring the per-section prod↔demo seam suites.
import { useEffect, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { DEMO_SESSION, ROLES } from "../../auth/session";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

// Renders the search result so the test can await the async seam via findByText.
function Harness() {
  const ws = useWorkspace();
  const [out, setOut] = useState(null);
  return (
    <button type="button" onClick={async () => setOut(await ws.searchLibrary("theft", ROLES.AUTHOR))}>
      {out ? `results:${out.length}:${out[0]?.entry.text || ""}:${out[0]?.score ?? ""}` : "go"}
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

describe("searchLibrary seam", () => {
  test("prod: fetches GET /api/library/search and maps entries into picker shape", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        entries: [
          {
            id: "srv-1",
            type: "Scenarios",
            title: "Night theft",
            body: "Theft from the yard at night",
            metadata: { tags: ["theft"] },
            similarity: 0.91
          }
        ]
      })
    });
    renderHarness();

    await user.click(screen.getByRole("button"));

    const btn = await screen.findByText(/results:1:/);
    expect(btn.textContent).toContain("Theft from the yard at night");
    expect(btn.textContent).toContain(":0.91");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = fetchFn.mock.calls[0][0];
    expect(url).toContain("/api/library/search");
    expect(url).toContain("q=theft");
    expect(url).toContain("type=Scenarios");
  });

  test("demo: fires NO request and ranks the scenario fixtures locally", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ entries: [] }) });
    renderHarness();

    await user.click(screen.getByRole("button"));

    const btn = await screen.findByText(/results:/);
    expect(fetchFn).not.toHaveBeenCalled();
    // Fixture ranking returned something with real scenario text.
    expect(btn.textContent).not.toContain("results:0:");
  });
});

describe("applyLibraryEntry", () => {
  test("with no §6 consumer registered, surfaces an info toast", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    function ApplyHarness() {
      const ws = useWorkspace();
      return (
        <>
          <button
            type="button"
            onClick={() => ws.applyLibraryEntry({ id: "l1", text: "Theft of materials from facility yard" })}
          >
            apply
          </button>
          <output>{ws.toast?.message || "idle"}</output>
        </>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider initialSession={DEMO_SESSION}>
          <WorkspaceProvider>
            <ApplyHarness />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "apply" }));
    expect(await screen.findByText(/Open Section 6 and select an evaluation/)).toBeTruthy();
  });

  test("registered §6 consumer receives the entry", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = (await import("@testing-library/user-event")).default.setup();
    function ConsumerHarness() {
      const { registerLibraryUseHandler, applyLibraryEntry } = useWorkspace();
      const [applied, setApplied] = useState("");
      useEffect(() => {
        return registerLibraryUseHandler((entry) => {
          setApplied(entry.text);
          return true;
        });
      }, [registerLibraryUseHandler]);
      return (
        <>
          <button
            type="button"
            onClick={() => applyLibraryEntry({ id: "l2", text: "Pirate boarding of supply vessel" })}
          >
            apply
          </button>
          <output>{applied || "idle"}</output>
        </>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider initialSession={DEMO_SESSION}>
          <WorkspaceProvider>
            <ConsumerHarness />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "apply" }));
    expect(await screen.findByText("Pirate boarding of supply vessel")).toBeTruthy();
  });
});
