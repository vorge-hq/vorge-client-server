import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { isRoleMfaRequired } from "../../auth/session";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";

export function MfaSettingsPage() {
  if (isDemoEnabled()) return <Navigate to="/login" replace />;

  const { session } = useAuth();
  if (!session?.token) return <Navigate to="/login" replace />;

  const requiredForRole = session.roles?.some((r) => isRoleMfaRequired(r));
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenCode, setRegenCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [newCodes, setNewCodes] = useState(null);

  async function handleDisable(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ password: disablePassword, code: disableCode })
      });
      setSuccess("MFA disabled. You will need to enroll again to re-enable it.");
      setDisablePassword("");
      setDisableCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Disable failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegen(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await apiRequest("/api/auth/mfa/regen-recovery-codes", {
        method: "POST",
        body: JSON.stringify({ code: regenCode })
      });
      setNewCodes(result.recoveryCodes);
      setRegenCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regeneration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-start justify-center bg-surface-sunken p-6 text-text-primary"
      style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="mt-12 w-full max-w-[480px]">
        <div className="mb-8 flex items-center gap-2">
          <Shield size={15} strokeWidth={2.5} className="text-primary" aria-hidden />
          <div className="font-semibold tracking-tight text-primary">MFA Settings</div>
        </div>

        {success ? <Banner tone="success" title="Done">{success}</Banner> : null}
        {error ? <Banner tone="danger" title="Failed">{error}</Banner> : null}

        <section className="mb-8 rounded-md border border-border-default bg-white p-5">
          <h2 className="mb-2 text-base font-semibold">Regenerate recovery codes</h2>
          <p className="mb-4 text-sm text-text-muted">
            Invalidates your current 10 codes and issues a fresh set. Requires your current
            authenticator code.
          </p>
          {newCodes ? (
            <>
              <Banner tone="warning" title="You will not see these again">
                Save them in a password manager.
              </Banner>
              <div className="mt-3 rounded-md border border-border-default bg-surface-sunken p-3 font-mono text-sm">
                {newCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
            </>
          ) : (
            <form className="space-y-3" onSubmit={handleRegen}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={regenCode}
                onChange={(e) => setRegenCode(e.target.value)}
                className="field-control"
              />
              <button
                type="submit"
                className="btn-secondary w-full justify-center py-2"
                disabled={submitting || !regenCode}
              >
                Generate new codes
              </button>
            </form>
          )}
        </section>

        <section className="rounded-md border border-border-default bg-white p-5">
          <h2 className="mb-2 text-base font-semibold">Disable MFA</h2>
          {requiredForRole ? (
            <p className="text-sm text-text-muted">
              MFA is required for your role and cannot be disabled. Contact an admin to change role
              assignments.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-text-muted">
                Requires your password and a current authenticator code.
              </p>
              <form className="space-y-3" onSubmit={handleDisable}>
                <input
                  type="password"
                  placeholder="Current password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="field-control"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  className="field-control"
                />
                <button
                  type="submit"
                  className="btn-secondary w-full justify-center py-2 text-rose-700"
                  disabled={submitting || !disablePassword || !disableCode}
                >
                  Disable MFA
                </button>
              </form>
            </>
          )}
        </section>

        <div className="mt-8 text-[11px] leading-relaxed text-text-disabled">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          MFA settings changes are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
