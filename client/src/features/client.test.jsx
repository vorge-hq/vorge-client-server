import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import {
  ROLES,
  canAccessFacility,
  canSwitchToRole,
  demoSession,
  isAuthenticated,
  isRoleMfaRequired
} from "../auth/session";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import {
  getHomeRouteForRole,
  getMobileNavigationForRole,
  getNavigationForRole
} from "./navigation/navigation";
import {
  ASSESSMENT_STATES,
  STATE_DESCRIPTORS,
  getActionTone,
  getAdvanceBanner,
  getAssessmentStateBanner,
  getSectionProgress,
  getStateChipClasses,
  getWorkflowActionsForRole,
  isAssessmentReadOnly
} from "./assessmentWorkspace/assessmentModel";
import {
  calculateRisk,
  getBandClasses,
  getBandForScore
} from "./assessmentWorkspace/riskMatrix";
import {
  MITIGATION_STATUSES,
  getMitigationKpis,
  validateMitigationUpdate
} from "./mitigationOwner/mitigationRules";
import { getOfflineModeMessage, isOnlineOnlyFeature } from "./fieldMode/offlineModel";
import {
  countUnread,
  filterForRole,
  getNotificationToneClasses
} from "./notifications/notificationModel";

describe("session helpers", () => {
  test("detects authentication", () => {
    expect(isAuthenticated(demoSession)).toBe(true);
    expect(isAuthenticated(null)).toBe(false);
    expect(isAuthenticated({})).toBe(false);
  });

  test("evaluates role and facility access", () => {
    expect(canSwitchToRole(demoSession, ROLES.REVIEWER)).toBe(true);
    expect(canSwitchToRole(demoSession, ROLES.ADMIN)).toBe(false);
    expect(canSwitchToRole(null, ROLES.ADMIN)).toBe(false);
    expect(canAccessFacility(demoSession, demoSession.facility.id)).toBe(true);
    expect(canAccessFacility(demoSession, "fake")).toBe(false);
  });

  test("MFA-required roles", () => {
    expect(isRoleMfaRequired(ROLES.APPROVER)).toBe(true);
    expect(isRoleMfaRequired(ROLES.ADMIN)).toBe(true);
    expect(isRoleMfaRequired(ROLES.AUTHOR)).toBe(false);
  });
});

describe("navigation model", () => {
  test("returns role-specific navigation and mobile subset", () => {
    const author = getNavigationForRole(ROLES.AUTHOR);
    expect(author.length).toBeGreaterThan(0);
    expect(getMobileNavigationForRole(ROLES.AUTHOR).length).toBeGreaterThanOrEqual(1);
    expect(getNavigationForRole(ROLES.MITIGATION_OWNER)[0].to).toBe("/mitigations");
    expect(getNavigationForRole("Unknown")).toEqual([]);
    expect(getMobileNavigationForRole("Unknown")).toEqual([]);
    expect(getHomeRouteForRole(ROLES.MITIGATION_OWNER)).toBe("/mitigations");
    expect(getHomeRouteForRole(ROLES.ADMIN)).toBe("/admin");
    expect(getHomeRouteForRole(ROLES.AUTHOR)).toBe("/dashboard");
  });
});

describe("assessment workspace model", () => {
  test("state banners and chip classes", () => {
    Object.values(ASSESSMENT_STATES).forEach((state) => {
      expect(getAssessmentStateBanner(state).length).toBeGreaterThan(0);
      expect(STATE_DESCRIPTORS[state]).toBeDefined();
      expect(getStateChipClasses(state)).toContain("bg-");
    });
    expect(getAssessmentStateBanner("Unknown")).toContain("unavailable");
    expect(getStateChipClasses("Unknown")).toContain("text-slate-600");
  });

  test("read-only logic respects role and state", () => {
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR })
    ).toBe(false);
    expect(
      isAssessmentReadOnly({
        state: ASSESSMENT_STATES.DRAFT,
        actingRole: ROLES.AUTHOR,
        serverCanEditContent: true
      })
    ).toBe(false);
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.AUTHOR })
    ).toBe(true);
    expect(
      isAssessmentReadOnly({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.REVIEWER })
    ).toBe(true);
  });

  test("section progress percent", () => {
    expect(getSectionProgress([{ id: 1 }, { id: 2 }, { id: 3 }], [1, 2])).toEqual({
      completed: 2,
      total: 3,
      percent: 67
    });
    expect(getSectionProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  test("workflow actions per role/state", () => {
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR }).map(
        (a) => a.id
      )
    ).toContain("submit");
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.REVIEWER }).map(
        (a) => a.id
      )
    ).toEqual(["review-complete", "send-back-author"]);
    expect(
      getWorkflowActionsForRole({
        state: ASSESSMENT_STATES.AWAITING_APPROVAL,
        actingRole: ROLES.APPROVER
      }).map((a) => a.id)
    ).toEqual(["approve", "send-back-reviewer", "reject"]);
    expect(
      getWorkflowActionsForRole({ state: ASSESSMENT_STATES.APPROVED, actingRole: ROLES.AUTHOR })
    ).toEqual([]);
    expect(getActionTone("primary")).toBe("btn-primary");
    expect(getActionTone("warn")).toBe("btn-warn");
    expect(getActionTone("danger")).toBe("btn-danger");
    expect(getActionTone("secondary")).toBe("btn-secondary");
    expect(getActionTone("unknown")).toBe("btn-secondary");
  });

  test("advance banner only for relevant roles", () => {
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.REVIEWER })
    ).toContain("Author submits");
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.IN_REVIEW, actingRole: ROLES.APPROVER })
    ).toContain("review is marked complete");
    expect(
      getAdvanceBanner({ state: ASSESSMENT_STATES.DRAFT, actingRole: ROLES.AUTHOR })
    ).toBeNull();
  });
});

describe("risk matrix calculations", () => {
  test("score and band derivations", () => {
    expect(calculateRisk(0, 3).score).toBeNull();
    expect(calculateRisk(null, 3).score).toBeNull();
    expect(calculateRisk(2, 1)).toMatchObject({ score: 2, band: "Low" });
    expect(calculateRisk(3, 3)).toMatchObject({ score: 9, band: "Medium" });
    expect(calculateRisk(4, 3)).toMatchObject({ score: 12, band: "High" });
    expect(calculateRisk(5, 5)).toMatchObject({ score: 25, band: "Very High" });
    expect(getBandForScore(null)).toBeNull();
    expect(getBandForScore(0)?.id).toBe("Low");
    expect(getBandClasses("High")).toContain("bg-risk-high-bg");
    expect(getBandClasses("Unknown")).toContain("bg-slate-100");
  });
});

describe("mitigation owner rules", () => {
  test("validation enforces approval, terminal Done, and required note", () => {
    expect(
      validateMitigationUpdate({
        currentStatus: "In Progress",
        nextStatus: "Done",
        note: "",
        assessmentState: "Approved"
      }).valid
    ).toBe(false);

    expect(
      validateMitigationUpdate({
        currentStatus: "In Progress",
        nextStatus: "Done",
        note: "Installed",
        assessmentState: "Approved"
      })
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateMitigationUpdate({
        currentStatus: "Done",
        nextStatus: "Open",
        note: "Reopen",
        assessmentState: "Approved"
      }).errors
    ).toContain("Done is terminal and cannot be reopened.");

    expect(
      validateMitigationUpdate({
        currentStatus: "Open",
        nextStatus: "In Progress",
        note: "",
        assessmentState: "Draft"
      }).errors
    ).toContain("Mitigation progress can only be updated after approval.");
  });

  test("KPIs calculate counts", () => {
    expect(
      getMitigationKpis([
        { status: MITIGATION_STATUSES.OPEN, targetDate: "2000-01-01" },
        { status: MITIGATION_STATUSES.IN_PROGRESS, targetDate: "2999-01-01" },
        { status: MITIGATION_STATUSES.DONE, updatedAt: new Date().toISOString() }
      ])
    ).toEqual({ open: 1, inProgress: 1, overdue: 1, doneThisYear: 1 });

    expect(getMitigationKpis([])).toEqual({ open: 0, inProgress: 0, overdue: 0, doneThisYear: 0 });
  });
});

describe("offline field-mode model", () => {
  test("messaging by connection state", () => {
    expect(getOfflineModeMessage({ isOnline: true, hasCheckout: false })).toContain("Online");
    expect(getOfflineModeMessage({ isOnline: true, hasCheckout: false, syncQueueLength: 2 })).toContain("2 offline");
    expect(getOfflineModeMessage({ isOnline: false, hasCheckout: true })).toContain("continue");
    expect(getOfflineModeMessage({ isOnline: false, hasCheckout: false })).toContain("read-only");
    expect(isOnlineOnlyFeature("ai")).toBe(true);
    expect(isOnlineOnlyFeature("field-mode")).toBe(false);
  });
});

describe("notification model", () => {
  const notifications = [
    { id: "1", read: false, severity: "info", targetRoles: ["Author"] },
    { id: "2", read: true, severity: "warn", targetRoles: ["Approver"] },
    { id: "3", read: false, severity: "danger", targetRoles: ["*"] }
  ];

  test("counts unread for a role", () => {
    expect(countUnread(notifications, ROLES.AUTHOR)).toBe(2);
    expect(countUnread(notifications, ROLES.APPROVER)).toBe(1);
    expect(countUnread(notifications)).toBe(2);
  });

  test("filters for role", () => {
    expect(filterForRole(notifications, ROLES.AUTHOR)).toHaveLength(2);
    expect(filterForRole(notifications, ROLES.REVIEWER)).toHaveLength(1);
    expect(filterForRole(notifications)).toEqual(notifications);
  });

  test("provides tone classes for severity", () => {
    expect(getNotificationToneClasses("warn")).toContain("amber");
    expect(getNotificationToneClasses("danger")).toContain("red");
    expect(getNotificationToneClasses("info")).toContain("slate");
    expect(getNotificationToneClasses("unknown")).toContain("slate");
  });
});

describe("ProtectedRoute", () => {
  test("redirects unauthenticated users to login", () => {
    render(
      <MemoryRouter initialEntries={["/private"]}>
        <AuthProvider initialSession={null}>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/private" element={<p>Private page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Login page").textContent).toBe("Login page");
  });

  test("allows matching roles and redirects mismatched roles to home", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider initialSession={{ ...demoSession, actingRole: ROLES.ADMIN, roles: [ROLES.ADMIN] }}>
          <Routes>
            <Route path="/dashboard" element={<p>Dashboard</p>} />
            <Route element={<ProtectedRoute requiredRoles={[ROLES.ADMIN]} />}>
              <Route path="/admin" element={<p>Admin page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Admin page").textContent).toBe("Admin page");
  });

  test("redirects mismatched role to their home route", () => {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider initialSession={demoSession}>
          <Routes>
            <Route path="/dashboard" element={<p>Author dashboard</p>} />
            <Route element={<ProtectedRoute requiredRoles={[ROLES.ADMIN]} />}>
              <Route path="/admin" element={<p>Admin page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("Author dashboard").textContent).toBe("Author dashboard");
  });
});
