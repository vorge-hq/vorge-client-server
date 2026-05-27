import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../auth/AuthContext";
import { ProtectedRoute } from "../../routes/ProtectedRoute";
import { MfaVerifyPage } from "../../pages/auth/MfaVerifyPage";
import { MfaEnrollPage } from "../../pages/auth/MfaEnrollPage";
import { MfaLockoutPage } from "../../pages/auth/MfaLockoutPage";
import { LoginPage } from "../../pages/auth/LoginPage";
import { ROLES } from "../../auth/session";
import { WorkspaceProvider } from "../assessmentWorkspace/WorkspaceContext";

function mockFetchOk(body = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function authedSession({ mfaSatisfied = true, mustReenroll = false, role = ROLES.ADMIN } = {}) {
  return {
    user: { id: "u1", name: "Test", email: "t@e.example" },
    facility: { id: "f1", name: "Facility 1" },
    facilities: [{ id: "f1", name: "Facility 1" }],
    roles: [role],
    actingRole: role,
    token: "test-token",
    mfaSatisfied,
    mustReenroll,
    demo: false
  };
}

function renderInRoutes(initialPath, routes, session) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider initialSession={session ?? null}>{routes}</AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_DEMO", "false");
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ProtectedRoute MFA gates", () => {
  function routes() {
    return (
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/mfa/verify" element={<p>Verify page</p>} />
        <Route path="/mfa/enroll" element={<p>Enroll page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>Dashboard ready</p>} />
        </Route>
      </Routes>
    );
  }

  test("unauthenticated user → /login", () => {
    renderInRoutes("/dashboard", routes(), null);
    expect(screen.getByText("Login page")).toBeTruthy();
  });

  test("session with mfaSatisfied=false → /mfa/verify", () => {
    renderInRoutes("/dashboard", routes(), authedSession({ mfaSatisfied: false }));
    expect(screen.getByText("Verify page")).toBeTruthy();
  });

  test("session with mustReenroll=true → /mfa/enroll", () => {
    renderInRoutes("/dashboard", routes(), authedSession({ mustReenroll: true }));
    expect(screen.getByText("Enroll page")).toBeTruthy();
  });

  test("fully-satisfied session → /dashboard renders", () => {
    renderInRoutes("/dashboard", routes(), authedSession());
    expect(screen.getByText("Dashboard ready")).toBeTruthy();
  });
});

describe("MfaVerifyPage", () => {
  test("demo mode → redirected to /login", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    renderInRoutes(
      "/mfa/verify",
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/mfa/verify" element={<MfaVerifyPage />} />
      </Routes>,
      null
    );
    expect(screen.getByText("Login page")).toBeTruthy();
  });

  test("no session token → redirected to /login", () => {
    renderInRoutes(
      "/mfa/verify",
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/mfa/verify" element={<MfaVerifyPage />} />
      </Routes>,
      null
    );
    expect(screen.getByText("Login page")).toBeTruthy();
  });

  test("renders TOTP form with mfaSatisfied=false session", () => {
    renderInRoutes(
      "/mfa/verify",
      <Routes>
        <Route path="/mfa/verify" element={<MfaVerifyPage />} />
      </Routes>,
      authedSession({ mfaSatisfied: false })
    );
    expect(screen.getByRole("heading", { name: /Two-factor verification/i })).toBeTruthy();
    expect(screen.getByLabelText("Authentication code")).toBeTruthy();
    expect(screen.getByText(/Remember this browser/i)).toBeTruthy();
  });

  test("toggle to recovery-code mode swaps the UI", async () => {
    const user = userEvent.setup();
    renderInRoutes(
      "/mfa/verify",
      <Routes>
        <Route path="/mfa/verify" element={<MfaVerifyPage />} />
      </Routes>,
      authedSession({ mfaSatisfied: false })
    );
    await user.click(screen.getByText(/Use a recovery code instead/i));
    expect(screen.getByRole("heading", { name: /Use a recovery code/i })).toBeTruthy();
    expect(screen.getByLabelText("Recovery code")).toBeTruthy();
  });
});

describe("MfaEnrollPage", () => {
  test("demo mode → redirected to /login", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    renderInRoutes(
      "/mfa/enroll",
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/mfa/enroll" element={<MfaEnrollPage />} />
      </Routes>,
      null
    );
    expect(screen.getByText("Login page")).toBeTruthy();
  });

  test("renders QR + manual key after enroll-start succeeds", async () => {
    mockFetchOk({
      otpauthUrl: "otpauth://totp/test",
      qrDataUrl: "data:image/png;base64,xxxx",
      manualKey: "JBSWY3DPEHPK3PXP"
    });
    renderInRoutes(
      "/mfa/enroll",
      <Routes>
        <Route path="/mfa/enroll" element={<MfaEnrollPage />} />
      </Routes>,
      authedSession({ mfaSatisfied: false })
    );
    expect(await screen.findByAltText("MFA QR code")).toBeTruthy();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeTruthy();
  });
});

describe("MfaLockoutPage", () => {
  test("renders timed-lockout banner for short tiers", () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/mfa/lockout", state: { remainingMs: 30_000, tier: "30s" } }]}
      >
        <Routes>
          <Route path="/mfa/lockout" element={<MfaLockoutPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Try again later/i)).toBeTruthy();
  });

  test("renders admin-reset guidance for 24h tier", () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/mfa/lockout", state: { remainingMs: 86_400_000, tier: "24h_admin_reset" } }
        ]}
      >
        <Routes>
          <Route path="/mfa/lockout" element={<MfaLockoutPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Contact your administrator/i)).toBeTruthy();
  });
});

describe("LoginPage demo mode (post-strip)", () => {
  test("demo flow has no MFA stage anywhere in the UI", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider initialSession={null}>
          <WorkspaceProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    // No "Multi-factor authentication" heading, no MFA-required badges in role picker
    expect(screen.queryByRole("heading", { name: /Multi-factor authentication/i })).toBeNull();
    expect(screen.queryByText(/MFA required/i)).toBeNull();
  });
});
