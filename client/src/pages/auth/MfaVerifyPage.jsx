import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";
import { getHomeRouteForRole } from "../../features/navigation/navigation";

const SESSION_STORAGE_KEY = "vantage.session";

export function MfaVerifyPage() {
  if (isDemoEnabled()) return <Navigate to="/login" replace />;

  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("totp"); // "totp" | "recovery"
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!session?.token) return <Navigate to="/login" replace />;
  if (session.mfaSatisfied === true && !session.mustReenroll) {
    return <Navigate to={getHomeRouteForRole(session.actingRole)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === "totp" ? "/api/auth/mfa/verify" : "/api/auth/mfa/verify-recovery";
      const body = mode === "totp" ? { code, trustDevice } : { code };
      const result = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body)
      });
      const nextSession = {
        ...session,
        mfaSatisfied: true,
        mustReenroll: Boolean(result.mustReenroll)
      };
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      }
      login(nextSession);
      if (nextSession.mustReenroll) {
        navigate("/mfa/enroll");
      } else {
        navigate(getHomeRouteForRole(session.actingRole));
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "MFA_LOCKED_OUT") {
        navigate("/mfa/lockout", {
          state: {
            remainingMs: err.details?.remainingMs,
            tier: err.details?.tier
          }
        });
        return;
      }
      if (err instanceof ApiError) {
        setError({ message: err.message || "Verification failed." });
      } else {
        setError({ message: "Verification failed. Try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-surface-sunken p-6 text-zinc-900"
      style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Shield size={15} strokeWidth={2.5} className="text-warning" aria-hidden />
          </div>
          <div className="font-semibold tracking-tight text-primary">Vantage</div>
          <div className="ml-1 text-xs text-zinc-500">SRA Platform</div>
        </div>

        <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-primary">
          {mode === "totp" ? "Two-factor verification" : "Use a recovery code"}
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          {mode === "totp"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter one of your one-time recovery codes (XXXXX-XXXXX)."}
        </p>

        <form className="space-y-3" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="code" className="field-label mb-1.5 block">
              {mode === "totp" ? "Authentication code" : "Recovery code"}
            </label>
            <input
              id="code"
              type="text"
              autoComplete={mode === "totp" ? "one-time-code" : "off"}
              inputMode={mode === "totp" ? "numeric" : "text"}
              placeholder={mode === "totp" ? "123 456" : "AAAAA-BBBBB"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="field-control"
              required
            />
          </div>

          {mode === "totp" ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
              />
              Remember this browser for 30 days
            </label>
          ) : null}

          {error ? (
            <Banner tone="danger" title="Verification failed">
              {error.message}
            </Banner>
          ) : null}

          <button
            type="submit"
            className="btn-primary mt-2 w-full justify-center py-2.5"
            disabled={submitting || !code}
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "totp" ? "recovery" : "totp");
              setCode("");
              setError(null);
            }}
            className="text-sm text-zinc-500 hover:text-primary"
          >
            {mode === "totp" ? "Use a recovery code instead" : "Use your authenticator app instead"}
          </button>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-zinc-400">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          MFA verifications are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
