// P3.5 · client Export button (§16). Proves the prod↔demo seam:
//   - PROD: choosing Word/PDF fires GET /export?format=… and streams the blob to
//     the browser; a failure (e.g. 403) surfaces inline, modal stays open.
//   - DEMO: no network at all (fixtures have no rendered document) — asserted
//     with a fetch spy.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider, useWorkspace } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { ExportModal } from "./ExportModal";

function mockFetch(responder) {
  const fn = vi.fn(responder);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function fileOk(filename = "sra.docx") {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob(["binary"]),
    headers: { get: () => `attachment; filename="${filename}"` }
  };
}

const onClose = vi.fn();

// Harness wires the modal to the real WorkspaceContext seam, exactly as the page does.
function Harness({ state = "Draft" }) {
  const workspace = useWorkspace();
  return (
    <ExportModal
      assessment={{ id: "aid-x", state }}
      onExport={(format) => workspace.exportDocument(format, "Author")}
      onClose={onClose}
    />
  );
}

function renderModal(props) {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <Harness {...props} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function exportCalls(fetchFn) {
  return fetchFn.mock.calls.filter(([url]) => String(url).includes("/export"));
}

beforeEach(() => {
  // jsdom lacks URL.createObjectURL; stub the download plumbing.
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  onClose.mockClear();
});

describe("prod mode (VITE_ENABLE_DEMO=false)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("choosing Word fires GET /export?format=docx and downloads, then closes", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => fileOk("sra.docx"));
    renderModal();

    await user.click(screen.getByRole("button", { name: /Word/ }));

    const calls = exportCalls(fetchFn);
    expect(calls.length).toBe(1);
    expect(String(calls[0][0])).toContain("/export?format=docx");
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("choosing PDF fires format=pdf", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => fileOk("sra.pdf"));
    renderModal();

    await user.click(screen.getByRole("button", { name: /PDF/ }));

    const calls = exportCalls(fetchFn);
    expect(calls.length).toBe(1);
    expect(String(calls[0][0])).toContain("format=pdf");
  });

  test("a non-approved assessment shows the non-final watermark note", () => {
    mockFetch(async () => fileOk());
    renderModal({ state: "Draft" });
    expect(screen.getByText(/watermarked as a non-final copy/i)).toBeTruthy();
  });

  test("an Approved assessment omits the watermark note", () => {
    mockFetch(async () => fileOk());
    renderModal({ state: "Approved" });
    expect(screen.queryByText(/watermarked as a non-final copy/i)).toBeNull();
  });

  test("a failed export surfaces inline and keeps the modal open", async () => {
    const user = userEvent.setup();
    mockFetch(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: "ROLE_NOT_ALLOWED", message: "The acting role cannot export assessments" } })
    }));
    renderModal();

    await user.click(screen.getByRole("button", { name: /Word/ }));

    expect(await screen.findByText(/cannot export assessments/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("demo mode (VITE_ENABLE_DEMO=true)", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("choosing a format fires NO network request", async () => {
    const user = userEvent.setup();
    const fetchFn = mockFetch(async () => fileOk());
    renderModal();

    await user.click(screen.getByRole("button", { name: /Word/ }));

    expect(exportCalls(fetchFn).length).toBe(0);
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
