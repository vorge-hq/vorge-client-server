// P3 · (g) content-entity WRITES — Section 4 threats (same mold as assets). PROD:
// a field-blur fires PATCH /threats/:id, "Add threat" fires POST, "Delete" fires
// DELETE — each with the lockVersion the client read and packing rich fields into
// the details bag; a 409 renders the reload affordance. DEMO fires nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { ThreatAssessmentSection } from "./ThreatAssessmentSection";

const ASSESSMENT = { id: "aid-4", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };

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
          <ThreatAssessmentSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}
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

  test("editing a threat field + blur fires PATCH with lockVersion and packs details", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({ threat: { id: "t1" }, lockVersion: 2 }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Organized Crime/ }));
    const field = screen.getByPlaceholderText(/e.g. Terrorism/);
    await user.type(field, " REV");
    await user.tab();

    const patches = callsMatching(fetchFn, "/threats/t1", "PATCH");
    expect(patches.length).toBe(1);
    const body = JSON.parse(patches[0][1].body);
    expect(typeof body.lockVersion).toBe("number");
    expect(body.details.classification).toContain("REV");
    expect(body.name).toBeTruthy();
  });

  test("Add threat fires POST and Delete fires DELETE", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchFn = mockFetch(async (url, options) => {
      if (options.method === "POST") return ok({ threat: { id: "srv-t", name: "New threat", details: {} }, lockVersion: 2 }, 201);
      return ok({ deleted: true, lockVersion: 3 });
    });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Add threat/ }));
    expect(callsMatching(fetchFn, "/threats", "POST").length).toBe(1);

    await user.click(await screen.findByRole("button", { name: /Delete threat/ }));
    expect(callsMatching(fetchFn, "/threats/srv-t", "DELETE").length).toBe(1);
  });

  test("a 409 on save renders the exact reload affordance", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    }));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Organized Crime/ }));
    await user.type(screen.getByPlaceholderText(/e.g. Terrorism/), " X");
    await user.tab();

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("edit+blur and add fire NO network requests", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({}));
    renderSection();

    await user.click(screen.getByRole("button", { name: /Organized Crime/ }));
    await user.type(screen.getByPlaceholderText(/e.g. Terrorism/), " X");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /Add threat/ }));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
