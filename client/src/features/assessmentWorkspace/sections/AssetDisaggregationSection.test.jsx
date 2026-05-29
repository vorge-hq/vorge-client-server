import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../../auth/AuthContext";
import { WorkspaceProvider } from "../WorkspaceContext";
import { DEMO_SESSION } from "../../../auth/session";
import { AssetDisaggregationSection } from "./AssetDisaggregationSection";

function renderSection(readOnly = false) {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={DEMO_SESSION}>
        <WorkspaceProvider>
          <AssetDisaggregationSection
            assessment={{ state: "Draft", name: "Lagos Refinery — 2026 SRA" }}
            readOnly={readOnly}
            errors={[]}
          />
        </WorkspaceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AD-1 anomaly acknowledgement (Section 3)", () => {
  test("flag → acknowledge (False positive) → muted state → re-flag on consequences edit", async () => {
    const user = userEvent.setup();
    renderSection();

    // Asset 7 is Medium criticality with severe consequence language → fires.
    await user.click(screen.getByRole("button", { name: /Asset 7/ }));
    expect(screen.getByText(/Consider raising/)).toBeTruthy();

    // Acknowledge via the chip → modal.
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByLabelText("False positive"));
    await user.click(within(dialog).getByRole("button", { name: "Acknowledge" }));

    // Warning softens to the acknowledged state; raw warning gone.
    expect(await screen.findByText(/Anomaly acknowledged — False positive/)).toBeTruthy();
    expect(screen.queryByText(/Consider raising/)).toBeNull();

    // Editing consequences invalidates the snapshot → warning re-fires
    // (text still contains severe keywords, so the rule still matches).
    const consequences = screen.getByDisplayValue(/Potential fatality/);
    fireEvent.change(consequences, {
      target: { value: "Potential fatality, major fire, environmental release and explosion" }
    });
    expect(await screen.findByText(/Consider raising/)).toBeTruthy();
    expect(screen.queryByText(/Anomaly acknowledged/)).toBeNull();
  });

  test("read-only mode shows the warning but no Acknowledge button", async () => {
    const user = userEvent.setup();
    renderSection(true);
    await user.click(screen.getByRole("button", { name: /Asset 7/ }));
    expect(screen.getByText(/Consider raising/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
  });
});
