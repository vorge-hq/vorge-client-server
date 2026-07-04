// P3 · (g) content-entity WRITES — Section 6 evaluations. Evaluations have only a
// PATCH endpoint (no create path — a known server gap), so persistEvaluation only
// PATCHes rows with a server UUID; client-created stubs stay local. This test
// hydrates a real (UUID) evaluation from a bundle, then proves an editor blur
// fires PATCH /evaluations/:id with the lockVersion and the packed r1/r2 bags; a
// 409 renders the reload affordance; demo fires nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { EvaluationSection } from "./EvaluationSection";

const ASSESSMENT = { id: "aid-6", state: "Draft", lockVersion: 1, name: "Eko Petrochemical Hub — 2026 SRA" };
const EVAL_ID = "11111111-1111-4111-8111-111111111111";
const BUNDLE = {
  assessment: { id: "aid-6", name: "Eko — 2026 SRA", facilityId: "f1", state: "Draft", lockVersion: 1, leadAuthorUserId: "u", contributors: [] },
  sectionTexts: {},
  assets: [{ id: "as1", name: "Asset 1", assetType: "Unit", criticality: "High", details: {} }],
  threats: [{ id: "th1", name: "Threat 1", details: { classification: "Criminality" } }],
  links: [{ assetId: "as1", threatId: "th1", enabled: true }],
  evaluations: [
    { id: EVAL_ID, assetId: "as1", threatId: "th1", scenario: "Seed scenario", controls: "", vulnerabilities: "", proposedMitigation: "", r1: { consequence: 3, likelihood: 3 }, r2: { consequence: 2, likelihood: 1 } }
  ]
};

function mockFetch(responder) {
  const fn = vi.fn(responder);
  vi.stubGlobal("fetch", fn);
  return fn;
}
function ok(body, status = 200) {
  return { ok: true, status, json: async () => body };
}

// Hydrates the bundle (prod) before rendering the section, so the active
// evaluation carries a real UUID. In demo, hydrate is a no-op and fixtures show.
function Harness() {
  const ws = useWorkspace();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ws.hydrateAssessmentBundle(ASSESSMENT.id, "Author").then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ready ? <EvaluationSection assessment={ASSESSMENT} errors={[]} /> : null;
}
function renderSection() {
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
function patchCalls(fetchFn) {
  return fetchFn.mock.calls.filter(([url, o]) => url.includes(`/evaluations/${EVAL_ID}`) && o?.method === "PATCH");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("editing an evaluation field + blur fires PATCH with lockVersion and packs r1/r2", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async (url, options) => {
      if (options?.method === "PATCH") return ok({ evaluation: { id: EVAL_ID }, lockVersion: 2 });
      return ok(BUNDLE); // GET bundle
    });
    renderSection();

    const scenario = await screen.findByPlaceholderText(/Describe the threat scenario/);
    await user.clear(scenario);
    await user.type(scenario, "Updated scenario");
    await user.tab();

    const patches = patchCalls(fetchFn);
    expect(patches.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(patches[patches.length - 1][1].body);
    expect(typeof body.lockVersion).toBe("number");
    expect(body.scenario).toContain("Updated scenario");
    expect(body.r1).toBeTypeOf("object");
    expect(body.r2).toBeTypeOf("object");
  });

  test("a 409 on save renders the exact reload affordance", async () => {
    const user = userEvent.setup();
    mockFetch(async (url, options) => {
      if (options?.method === "PATCH") {
        return { ok: false, status: 409, json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } }) };
      }
      return ok(BUNDLE);
    });
    renderSection();

    const scenario = await screen.findByPlaceholderText(/Describe the threat scenario/);
    await user.type(scenario, " X");
    await user.tab();

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("editing a fixture evaluation + blur fires NO network request", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => ok({}));
    renderSection();

    const scenario = await screen.findByPlaceholderText(/Describe the threat scenario/);
    await user.type(scenario, " X");
    await user.tab();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
