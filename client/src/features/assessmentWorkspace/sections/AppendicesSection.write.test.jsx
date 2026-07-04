// P3 · (g) content-entity WRITES — Section 9.A contributors (whole-list PUT).
// PROD: adding/editing a contributor fires PUT /contributors with the lockVersion
// and the full list; a 409 renders the reload affordance. DEMO fires nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { AppendicesSection } from "./AppendicesSection";

const ASSESSMENT = { id: "aid-9", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };

function mockFetch(responder) {
  const fn = vi.fn(responder);
  vi.stubGlobal("fetch", fn);
  return fn;
}
function ok(body, status = 200) {
  return { ok: true, status, json: async () => body };
}
function renderSection() {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <AppendicesSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}
function putContribCalls(fetchFn) {
  return fetchFn.mock.calls.filter(([url, o]) => url.includes("/contributors") && o?.method === "PUT");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("adding a contributor fires PUT /contributors with lockVersion and the full list", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({ contributors: [], lockVersion: 2 }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Add contributor/ }));

    const puts = putContribCalls(fetchFn);
    expect(puts.length).toBe(1);
    const body = JSON.parse(puts[0][1].body);
    expect(typeof body.lockVersion).toBe("number");
    expect(Array.isArray(body.contributors)).toBe(true);
    expect(body.contributors.length).toBeGreaterThan(0);
  });

  test("a 409 renders the exact reload affordance", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Add contributor/ }));

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("adding a contributor fires NO network request", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({}));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Add contributor/ }));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
