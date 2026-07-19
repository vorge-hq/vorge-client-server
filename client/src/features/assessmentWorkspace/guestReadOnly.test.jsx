// §Guest read-only access · G5 — G-RTL5 (a read-only guest section fires ZERO
// mutating requests) + G-RTL6 (a forced write that 403s surfaces READ_ONLY_MESSAGE
// and never a false "saved"). Patterns: *.write.test.jsx fetch-spy.
// Plan: docs/plans/guest-viewer-execution-plan.md.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { READ_ONLY_MESSAGE } from "../../api/assessmentApi";
import { AssetDisaggregationSection } from "./sections/AssetDisaggregationSection";

const ASSESSMENT = { id: "aid-guest", state: "In Review", lockVersion: 1, name: "Bonny Terminal — 2026 SRA" };

const GUEST_SESSION = {
  user: { id: "u-guest", name: "Vorge Guest" },
  facility: { id: "fac-1", name: "Bonny Terminal", displayName: "Operator A — Bonny Terminal" },
  facilities: [{ id: "fac-1", name: "Bonny Terminal" }],
  actingRole: ROLES.GUEST,
  roles: [ROLES.GUEST],
  token: "tok",
  mfaSatisfied: true
};

function mockFetch(responder) {
  const fn = vi.fn(responder);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mutatingCalls(fetchFn) {
  return fetchFn.mock.calls.filter(([, opts]) => ["POST", "PUT", "PATCH", "DELETE"].includes(opts?.method));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("§Guest — read-only section fires no writes (G-RTL5)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("a guest (readOnly) Section 3 has no enabled add/edit control and fires no mutating fetch", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));

    render(
      <MemoryRouter>
        <AuthProvider initialSession={GUEST_SESSION}>
          <WorkspaceProvider>
            <AssetDisaggregationSection assessment={ASSESSMENT} readOnly errors={[]} />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // No enabled "Add asset" affordance for a read-only guest.
    const addBtn = screen.queryByRole("button", { name: /add asset/i });
    if (addBtn) {
      expect(addBtn).toBeDisabled();
      await user.click(addBtn); // clicking a disabled control must do nothing
    }

    expect(mutatingCalls(fetchFn)).toHaveLength(0);
  });
});

// Directly exercise the WorkspaceContext write seam so the 403 handling is proven
// regardless of which section triggered it.
function SaveHarness({ onResult }) {
  const workspace = useWorkspace();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await workspace.saveSectionText({
          assessmentId: "aid-guest",
          sectionNumber: 1,
          contentText: "forced write",
          lockVersion: 1,
          actingRole: ROLES.GUEST
        });
        onResult(result);
      }}
    >
      force-save
    </button>
  );
}

describe("§Guest — forced write 403 surfaces cleanly (G-RTL6)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("a write that 403s returns READ_ONLY_MESSAGE + forbidden, never ok/saved", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "ROLE_NOT_ALLOWED", message: "denied" } })
    }));

    let result = null;
    render(
      <MemoryRouter>
        <AuthProvider initialSession={GUEST_SESSION}>
          <WorkspaceProvider>
            <SaveHarness onResult={(r) => (result = r)} />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /force-save/i }));

    expect(result).toBeTruthy();
    expect(result.forbidden).toBe(true);
    expect(result.error).toBe(READ_ONLY_MESSAGE);
    expect(result.ok).not.toBe(true); // no false "saved"
  });
});
