// P3 · (g) content-entity WRITES — Section 5 asset×threat links. PROD: toggling a
// cell fires PUT /links/:assetId/:threatId with { enabled, lockVersion }; a 409
// renders the reload affordance. DEMO fires nothing. Driven through the "by
// threat" view whose Link/Linked buttons are the easiest cells to target.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { AssetThreatMatrixSection } from "./AssetThreatMatrixSection";

const ASSESSMENT = { id: "aid-5", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };

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
          <AssetThreatMatrixSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
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

  test("linking an unscoped pair fires PUT /links with enabled=true and lockVersion", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({ link: {}, lockVersion: 2 }));
    renderSection();

    await user.click(screen.getByRole("button", { name: "By threat" }));
    await user.click(screen.getAllByRole("button", { name: "Link" })[0]);

    const puts = fetchFn.mock.calls.filter(([url, o]) => url.includes("/links/") && o?.method === "PUT");
    expect(puts.length).toBe(1);
    const body = JSON.parse(puts[0][1].body);
    expect(body.enabled).toBe(true);
    expect(typeof body.lockVersion).toBe("number");
  });

  test("a 409 renders the exact reload affordance", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    }));
    renderSection();

    await user.click(screen.getByRole("button", { name: "By threat" }));
    await user.click(screen.getAllByRole("button", { name: "Link" })[0]);

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("linking a pair fires NO network request", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({}));
    renderSection();

    await user.click(screen.getByRole("button", { name: "By threat" }));
    await user.click(screen.getAllByRole("button", { name: "Link" })[0]);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
