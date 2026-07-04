// P3 · (g) — §2 Facility Info is a structured form persisted as JSON in the
// section-2 content_text column (2026-07-04 decision). This proves the seam: in
// PROD a field edit + blur fires PUT /sections/2 with the lockVersion the client
// read and a JSON body; a 409 renders the exact reload copy; in DEMO nothing hits
// the network (fixtures only), asserted with a fetch spy.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { CONFLICT_RELOAD_MESSAGE } from "../../../api/assessmentApi";
import { FacilityInfoSection } from "./FacilityInfoSection";

const ASSESSMENT = { id: "aid-2", state: "Draft", lockVersion: 4, facilityName: "Eko Petrochemical Hub" };

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function editNameAndBlur() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <FacilityInfoSection assessment={ASSESSMENT} readOnly={false} errors={[]} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
  const nameField = screen.getByLabelText("Facility name");
  await user.click(nameField);
  await user.type(nameField, " North");
  await user.tab(); // blur → save
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("a field edit fires PUT /sections/2 with the lockVersion and a JSON body", async () => {
    const fetchFn = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ section: { sectionNumber: 2 }, lockVersion: 5 })
    });

    await editNameAndBlur();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toContain(`/api/assessments/${ASSESSMENT.id}/sections/2`);
    expect(options.method).toBe("PUT");
    const body = JSON.parse(options.body);
    expect(body.lockVersion).toBe(4);
    // contentText is the serialized structured form, not a plain string.
    const form = JSON.parse(body.contentText);
    expect(form.name).toContain("North");
    expect(form.type).toBe("Refinery");
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });

  test("a 409 renders the exact reload affordance", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "LOCK_VERSION_CONFLICT", message: "conflict" } })
    });

    await editNameAndBlur();

    expect(await screen.findByText(CONFLICT_RELOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("a field edit fires NO network request (fixtures only)", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({}) });

    await editNameAndBlur();

    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByText(CONFLICT_RELOAD_MESSAGE)).toBeNull();
  });
});
