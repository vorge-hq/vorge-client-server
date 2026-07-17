// P4 · O5 — drafted summary prod↔demo seam + the §1/§8 "Draft with AI" flow.
// PROD fires POST generate-draft; DEMO derives a draft locally (no fetch).
// Fetch-spy, mirroring the per-section seam suites.
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { DEMO_SESSION, ROLES } from "../../auth/session";
import { Toast } from "../../components/Toast";
import { ACTIVE_ASSESSMENT_ID } from "../../data/assessments";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { ExecutiveSummarySection } from "./sections/ExecutiveSummarySection";

const DRAFT_ASSESSMENT = {
  id: ACTIVE_ASSESSMENT_ID,
  state: "Draft",
  lockVersion: 1,
  name: "Demo SRA",
  executiveSummary: ""
};

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateSectionDraft seam", () => {
  function Harness() {
    const ws = useWorkspace();
    const [out, setOut] = useState(null);
    return (
      <button type="button" onClick={async () => setOut(await ws.generateSectionDraft(1, ROLES.AUTHOR))}>
        {out ? `draft:${out.slice(0, 12)}` : "go"}
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

  test("prod: fires POST generate-draft and returns the server draft", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = userEvent.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ draft: "Server draft text.", sectionNumber: 1 }) });
    renderHarness();

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText(/draft:Server draft/)).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toContain("/sections/1/generate-draft");
    expect(opts.method).toBe("POST");
  });

  test("demo: derives a draft locally and fires NO request", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ draft: "x" }) });
    renderHarness();

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText(/draft:/)).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("ExecutiveSummarySection — Draft with AI (demo)", () => {
  function renderSection(session) {
    return render(
      <MemoryRouter>
        <AuthProvider initialSession={session}>
          <WorkspaceProvider>
            <ExecutiveSummarySection assessment={DRAFT_ASSESSMENT} readOnly={false} errors={[]} />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  test("Author: generate → accept drops the draft into the editor and persists", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => ({ draft: "x" }) });
    render(
      <MemoryRouter>
        <AuthProvider initialSession={{ ...DEMO_SESSION, actingRole: ROLES.AUTHOR }}>
          <WorkspaceProvider>
            <ExecutiveSummarySection assessment={DRAFT_ASSESSMENT} readOnly={false} errors={[]} />
            <Toast />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /Draft with AI/ }));

    // Modal opens with the AI-generated label + an editable draft.
    expect(await screen.findByText(/AI-generated, requires human review/)).toBeTruthy();
    const modalDraft = screen.getByLabelText("AI draft");
    expect(modalDraft.value.length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Accept draft" }));

    // Draft lands in the editor and persists immediately (no blur required).
    const editor = screen.getByPlaceholderText(/Draft an executive summary/);
    expect(editor.value.length).toBeGreaterThan(0);
    expect(await screen.findByText("Executive Summary saved.")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("Author: accept in prod fires PUT /sections/1", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    const user = userEvent.setup();
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes("generate-draft")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ draft: "Accepted prod draft.", sectionNumber: 1 })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ section: { sectionNumber: 1, contentText: "Accepted prod draft." }, lockVersion: 2 })
      };
    });
    vi.stubGlobal("fetch", fetchFn);

    render(
      <MemoryRouter>
        <AuthProvider initialSession={{ ...DEMO_SESSION, actingRole: ROLES.AUTHOR }}>
          <WorkspaceProvider>
            <ExecutiveSummarySection assessment={DRAFT_ASSESSMENT} readOnly={false} errors={[]} />
            <Toast />
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /Draft with AI/ }));
    expect(await screen.findByLabelText("AI draft")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept draft" }));

    expect(await screen.findByText("Executive Summary saved.")).toBeTruthy();
    const putCall = fetchFn.mock.calls.find(
      ([url, opts]) => String(url).includes("/sections/1") && opts?.method === "PUT"
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall[1].body).contentText).toBe("Accepted prod draft.");
  });

  test("non-Author does not see the Draft with AI affordance", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    renderSection({ ...DEMO_SESSION, actingRole: ROLES.REVIEWER });
    expect(screen.queryByRole("button", { name: /Draft with AI/ })).toBeNull();
  });
});
