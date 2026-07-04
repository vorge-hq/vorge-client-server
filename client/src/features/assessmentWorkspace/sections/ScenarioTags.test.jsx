// P4 · O4 — ScenarioTags chips UI (§9.6). Runs in DEMO mode (no fetch): suggest
// renders "AI-suggested" chips; the Author can remove, add-manual, and confirm;
// a 30s timeout auto-confirms. Confirmed chips drop the AI badge.
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { DEMO_SESSION } from "../../../auth/session";
import { WorkspaceProvider } from "../WorkspaceContext";
import { ScenarioTags } from "./ScenarioTags";

const EVAL_ID = "11111111-2222-4333-8444-555555555555";

function renderTags(autoConfirmMs) {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <ScenarioTags evaluationId={EVAL_ID} canEdit autoConfirmMs={autoConfirmMs} />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ScenarioTags", () => {
  test("suggest renders AI-suggested chips; remove and add-manual work", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    renderTags();

    await user.click(screen.getByRole("button", { name: "Suggest tags" }));

    const panel = screen.getByTestId("scenario-tags");
    expect(await within(panel).findByText("Insider")).toBeTruthy();
    expect(within(panel).getByText("People")).toBeTruthy();
    // The suggested chips are badged AI-suggested.
    expect(within(panel).getAllByLabelText("AI-suggested").length).toBe(2);

    // Remove one chip.
    await user.click(screen.getByRole("button", { name: "Remove Insider" }));
    expect(within(panel).queryByText("Insider")).toBeNull();

    // Add a manual tag.
    await user.type(screen.getByLabelText("Manual tag value"), "Terrorism");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(within(panel).getByText("Terrorism")).toBeTruthy();
  });

  test("explicit confirm drops the AI badge (tags become confirmed)", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    renderTags();

    await user.click(screen.getByRole("button", { name: "Suggest tags" }));
    const panel = screen.getByTestId("scenario-tags");
    await within(panel).findByText("Insider");

    await user.click(screen.getByRole("button", { name: "Confirm tags" }));

    expect(await within(panel).findByText("Insider")).toBeTruthy();
    expect(within(panel).queryAllByLabelText("AI-suggested").length).toBe(0);
  });

  test("removing an already-confirmed tag re-enables Confirm and persists the smaller set", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    renderTags();

    await user.click(screen.getByRole("button", { name: "Suggest tags" }));
    const panel = screen.getByTestId("scenario-tags");
    await within(panel).findByText("Insider");

    // Confirm → all chips confirmed, Confirm button disabled (clean).
    await user.click(screen.getByRole("button", { name: "Confirm tags" }));
    expect(within(panel).queryAllByLabelText("AI-suggested").length).toBe(0);
    expect(screen.getByRole("button", { name: "Confirm tags" }).disabled).toBe(true);

    // Remove a confirmed chip → Confirm re-enabled (the bug: it stayed disabled).
    await user.click(screen.getByRole("button", { name: "Remove Insider" }));
    expect(screen.getByRole("button", { name: "Confirm tags" }).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirm tags" }));
    expect(within(panel).queryByText("Insider")).toBeNull();
    expect(within(panel).getByText("People")).toBeTruthy();
  });

  test("the auto-confirm timeout confirms the suggested set (§9.6)", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    const user = userEvent.setup();
    // Drive the §9.6 30s timer with a tiny injected window so the test needn't
    // wait real seconds — the timer path is identical.
    renderTags(30);

    await user.click(screen.getByRole("button", { name: "Suggest tags" }));
    const panel = screen.getByTestId("scenario-tags");
    expect(within(panel).getAllByLabelText("AI-suggested").length).toBe(2);

    await waitFor(() => expect(within(panel).queryAllByLabelText("AI-suggested").length).toBe(0));
    expect(within(panel).getByText("Insider")).toBeTruthy();
  });
});
