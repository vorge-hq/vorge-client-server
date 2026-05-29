import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";

const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordPage() {
  if (isDemoEnabled()) {
    return <Navigate to="/login" replace />;
  }

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    Boolean(token) &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm &&
    !submitting;

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => navigate("/login"), 2000);
    return () => clearTimeout(timer);
  }, [success, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PASSWORD_TOO_SHORT") {
        setError({ tone: "validation", message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      } else if (err instanceof ApiError && err.code === "INVALID_RESET_TOKEN") {
        setError({ tone: "expired", message: "This reset link has expired or already been used." });
      } else {
        setError({ tone: "generic", message: "Something went wrong, try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-surface-sunken p-6 text-text-primary"
      style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Shield size={15} strokeWidth={2.5} className="text-warning" aria-hidden />
          </div>
          <div className="font-semibold tracking-tight text-primary">Vantage</div>
          <div className="ml-1 text-xs text-text-muted">SRA Platform</div>
        </div>

        <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-primary">
          Set a new password
        </h1>
        <p className="mb-8 text-sm text-text-muted">
          Pick something at least {MIN_PASSWORD_LENGTH} characters long. Existing sessions on other devices will sign out.
        </p>

        {!token ? (
          <Banner tone="danger" title="Invalid or missing reset link">
            <span>
              Request a new reset via{" "}
              <Link to="/forgot-password" className="underline">
                forgot password
              </Link>
              .
            </span>
          </Banner>
        ) : success ? (
          <Banner tone="success" title="Password reset successfully">
            Redirecting you to sign in&hellip;
          </Banner>
        ) : error?.tone === "expired" ? (
          <Banner tone="danger" title="Reset link no longer valid">
            <span>
              This reset link has expired or already been used.{" "}
              <Link to="/forgot-password" className="underline">
                Request a new one
              </Link>
              .
            </span>
          </Banner>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="password" className="field-label mb-1.5 block">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="field-control"
                required
              />
              {tooShort ? (
                <p className="mt-1 text-xs text-rose-600">
                  Password must be at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="confirm" className="field-label mb-1.5 block">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="field-control"
                required
              />
              {mismatch ? (
                <p className="mt-1 text-xs text-rose-600">Passwords don&rsquo;t match.</p>
              ) : null}
            </div>

            {error && error.tone !== "expired" ? (
              <Banner tone="danger" title="Reset failed">
                {error.message}
              </Banner>
            ) : null}

            <button
              type="submit"
              className="btn-primary mt-2 w-full justify-center py-2.5"
              disabled={!canSubmit}
            >
              {submitting ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-text-muted hover:text-primary">
            Back to sign in
          </Link>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-text-disabled">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          Password-reset attempts are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
