import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "../../pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../../pages/auth/ResetPasswordPage";

function mockFetchOk(body = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function mockFetchError(status, code) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: { code, message: "error" } })
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

function renderForgot() {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderReset(search = "?token=" + "a".repeat(64)) {
  return render(
    <MemoryRouter initialEntries={["/reset-password" + search]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<p>Forgot password page</p>} />
      </Routes>
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

describe("ForgotPasswordPage", () => {
  test("renders the email form in prod mode", () => {
    renderForgot();
    expect(screen.getByRole("heading", { name: /Reset your password/i })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send reset link/i })).toBeTruthy();
  });

  test("happy-path submit shows the check-your-inbox confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchOk();
    renderForgot();

    await user.type(screen.getByLabelText("Email"), "adaeze@example.com");
    await user.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/If that email is registered/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toMatch(/\/api\/auth\/forgot-password$/);
    expect(calledOpts.method).toBe("POST");
    expect(JSON.parse(calledOpts.body)).toEqual({ email: "adaeze@example.com" });
  });

  test("network error surfaces a generic banner", async () => {
    const user = userEvent.setup();
    mockFetchError(500, "INTERNAL_ERROR");
    renderForgot();

    await user.type(screen.getByLabelText("Email"), "adaeze@example.com");
    await user.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/Unable to submit request/i)).toBeTruthy();
  });

  test("demo mode redirects to /login", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    renderForgot();
    expect(screen.getByText("Login page")).toBeTruthy();
  });
});

describe("ResetPasswordPage", () => {
  test("renders the password form when ?token is present", () => {
    renderReset();
    expect(screen.getByRole("heading", { name: /Set a new password/i })).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
  });

  test("missing ?token shows the invalid-link banner with a forgot-password link", () => {
    renderReset("");
    expect(screen.getByText(/Invalid or missing reset link/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /forgot password/i })).toBeTruthy();
  });

  test("short password keeps the submit button disabled", async () => {
    const user = userEvent.setup();
    renderReset();

    const submit = screen.getByRole("button", { name: /Reset password/i });
    expect(submit.disabled).toBe(true);

    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");

    expect(submit.disabled).toBe(true);
    expect(screen.getByText("Password must be at least 12 characters.")).toBeTruthy();
  });

  test("mismatched confirm keeps the submit button disabled", async () => {
    const user = userEvent.setup();
    renderReset();

    await user.type(screen.getByLabelText("New password"), "ValidPassword12!");
    await user.type(screen.getByLabelText("Confirm new password"), "DifferentPass45@");

    expect(screen.getByText(/don.t match/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reset password/i }).disabled).toBe(true);
  });

  test("happy-path submit shows success banner and navigates to /login after 2s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const fetchMock = mockFetchOk();
    renderReset();

    await user.type(screen.getByLabelText("New password"), "ValidPassword12!");
    await user.type(screen.getByLabelText("Confirm new password"), "ValidPassword12!");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(await screen.findByText(/Password reset successfully/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(await screen.findByText("Login page")).toBeTruthy();

    vi.useRealTimers();
  });

  test("server 401 INVALID_RESET_TOKEN switches to the expired-link UI", async () => {
    const user = userEvent.setup();
    mockFetchError(401, "INVALID_RESET_TOKEN");
    renderReset();

    await user.type(screen.getByLabelText("New password"), "ValidPassword12!");
    await user.type(screen.getByLabelText("Confirm new password"), "ValidPassword12!");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(await screen.findByText(/Reset link no longer valid/i)).toBeTruthy();
  });

  test("server 400 PASSWORD_TOO_SHORT surfaces inline validation message", async () => {
    const user = userEvent.setup();
    mockFetchError(400, "PASSWORD_TOO_SHORT");
    renderReset();

    // Bypass client-side length check by typing 12 chars but having server reject.
    // (Server-side rejection is the safety net; client guards are advisory.)
    await user.type(screen.getByLabelText("New password"), "Twelve12345!");
    await user.type(screen.getByLabelText("Confirm new password"), "Twelve12345!");
    await user.click(screen.getByRole("button", { name: /Reset password/i }));

    expect(await screen.findByText(/Reset failed/i)).toBeTruthy();
  });

  test("demo mode redirects to /login", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    renderReset();
    expect(screen.getByText("Login page")).toBeTruthy();
  });
});
