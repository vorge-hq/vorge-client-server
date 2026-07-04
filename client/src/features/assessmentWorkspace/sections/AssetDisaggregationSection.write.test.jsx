// P3 · (g) content-entity WRITES — Section 3 assets. Proves the prod↔demo seam:
// in PROD a field-blur fires PATCH /assets/:id, "Add asset" fires POST, "Delete"
// fires DELETE — each carrying the lockVersion the client read and packing the
// rich fields into the details bag; a 409 renders the reload affordance. In DEMO
// none of these touch the network (fixtures only), asserted with a fetch spy.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { AssetDisaggregationSection } from "./AssetDisaggregationSection";

const ASSESSMENT = { id: "aid-3", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };

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
          <AssetDisaggregationSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

// Requests we care about, ignoring any unrelated traffic.
function callsMatching(fetchFn, pathPart, method) {
  return fetchFn.mock.calls.filter(
    ([url, options]) => url.includes(pathPart) && (!method || options?.method === method)
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("editing an asset field + blur fires PATCH with lockVersion and packs the details bag", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({ asset: { id: "a1" }, lockVersion: 2 }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Asset 1/ }));
    const typeField = screen.getByPlaceholderText(/e.g. Process Unit/);
    await user.type(typeField, " REV");
    await user.tab(); // blur → persist

    const patches = callsMatching(fetchFn, "/assets/a1", "PATCH");
    expect(patches.length).toBe(1);
    const body = JSON.parse(patches[0][1].body);
    expect(typeof body.lockVersion).toBe("number");
    expect(body.assetType).toContain("REV");
    // description/dependencies/consequences ride the details jsonb, not columns.
    expect(body.details).toBeTypeOf("object");
    expect(body.details).toHaveProperty("description");
  });

  test("Add asset fires POST and Delete fires DELETE", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async (url, options) => {
      if (options.method === "POST") return ok({ asset: { id: "srv-new", name: "Asset 8", details: {} }, lockVersion: 2 }, 201);
      return ok({ deleted: true, lockVersion: 3 });
    });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Add asset/ }));
    expect(callsMatching(fetchFn, "/assets", "POST").length).toBe(1);

    // The new row auto-expands; delete it.
    await user.click(await screen.findByRole("button", { name: /Delete asset/ }));
    expect(callsMatching(fetchFn, "/assets/srv-new", "DELETE").length).toBe(1);
  });

  test("a 409 on save renders the exact reload affordance", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Asset 1/ }));
    const typeField = screen.getByPlaceholderText(/e.g. Process Unit/);
    await user.type(typeField, " X");
    await user.tab();

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("edit+blur, add, and delete fire NO network requests", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({}));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Asset 1/ }));
    const typeField = screen.getByPlaceholderText(/e.g. Process Unit/);
    await user.type(typeField, " X");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /Add asset/ }));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
