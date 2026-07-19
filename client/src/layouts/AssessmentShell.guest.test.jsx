// §Guest read-only access · G5 — G-RTL4 (guest workspace shell: banner, no
// export/workflow affordances) + G-RTL7 (isAssessmentReadOnly for Guest).
// Plan: docs/plans/guest-viewer-execution-plan.md.
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { ROLES } from "../auth/session";
import { WorkspaceProvider } from "../features/assessmentWorkspace/WorkspaceContext";
import { isAssessmentReadOnly } from "../features/assessmentWorkspace/assessmentModel";
import { AssessmentShell, GUEST_BANNER_COPY } from "./AssessmentShell";

function sessionFor(actingRole) {
  return {
    user: { id: "u-guest", name: "Vorge Guest" },
    facility: { id: "fac-1", name: "Bonny Terminal", displayName: "Operator A — Bonny Terminal" },
    facilities: [{ id: "fac-1", name: "Bonny Terminal" }],
    actingRole,
    roles: [actingRole],
    token: "tok",
    mfaSatisfied: true
  };
}

function assessmentWith(permissions) {
  return {
    id: "a1",
    name: "Bonny Terminal — 2026 SRA",
    state: "In Review",
    cycle: 2026,
    completedSectionIds: [],
    leadAuthorUserId: "u-author",
    permissions
  };
}

function renderShell(actingRole, permissions) {
  return render(
    <MemoryRouter>
      <AuthProvider initialSession={sessionFor(actingRole)}>
        <WorkspaceProvider>
          <AssessmentShell assessment={assessmentWith(permissions)} activeSectionId={1} />
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

const WORKFLOW_AFFORDANCE = /submit|approve|complete review|send back|recall|reject|withdraw/i;

describe("§Guest — AssessmentShell (G-RTL4)", () => {
  test("guest sees the read-only banner, and NO export or workflow affordances", () => {
    renderShell(ROLES.GUEST, { canRead: true, canExport: false });

    // Bound banner copy, verbatim.
    expect(screen.getByText(GUEST_BANNER_COPY)).toBeTruthy();
    // Export hidden because the server said canExport === false.
    expect(screen.queryByRole("button", { name: /export document/i })).toBeNull();
    // No workflow action buttons (getWorkflowActionsForRole(Guest) → []).
    expect(screen.queryByRole("button", { name: WORKFLOW_AFFORDANCE })).toBeNull();
  });

  test("a writer role (Author) shows export and NO guest banner (regression)", () => {
    renderShell(ROLES.AUTHOR, { canRead: true, canExport: true });
    expect(screen.queryByText(GUEST_BANNER_COPY)).toBeNull();
    expect(screen.getByRole("button", { name: /export document/i })).toBeTruthy();
  });
});

describe("§Guest — read-only derivation (G-RTL7)", () => {
  test("isAssessmentReadOnly is true for Guest even in Draft; false for Author in Draft", () => {
    expect(isAssessmentReadOnly({ state: "Draft", actingRole: ROLES.GUEST })).toBe(true);
    expect(isAssessmentReadOnly({ state: "Draft", actingRole: ROLES.AUTHOR })).toBe(false);
  });
});
