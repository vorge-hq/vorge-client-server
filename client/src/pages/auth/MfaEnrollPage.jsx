import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";
import { SESSION_STORAGE_KEY } from "../../config/storageKeys";
import { getHomeRouteForRole } from "../../features/navigation/navigation";

export function MfaEnrollPage() {
  if (isDemoEnabled()) return <Navigate to="/login" replace />;

  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [manualKey, setManualKey] = useState(null);
  const [startError, setStartError] = useState(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!session?.token || qrDataUrl) return;
    (async () => {
      try {
        const result = await apiRequest("/api/auth/mfa/enroll-start", { method: "POST" });
        setQrDataUrl(result.qrDataUrl);
        setManualKey(result.manualKey);
      } catch (err) {
        setStartError(
          err instanceof ApiError ? err.message : "Could not start enrollment. Try again."
        );
      }
    })();
  }, [session?.token, qrDataUrl]);

  if (!session?.token) return <Navigate to="/login" replace />;
  if (session.mfaSatisfied === true && !session.mustReenroll && !recoveryCodes) {
    return <Navigate to={getHomeRouteForRole(session.actingRole)} replace />;
  }

  async function handleVerify(event) {
    event.preventDefault();
    setVerifyError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest("/api/auth/mfa/enroll-verify", {
        method: "POST",
        body: JSON.stringify({ code })
      });
      setRecoveryCodes(result.recoveryCodes || []);
      // Server has promoted session.mfa_satisfied=true and cleared
      // must_reenroll; update local state to match.
      const nextSession = { ...session, mfaSatisfied: true, mustReenroll: false };
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      }
      login(nextSession);
    } catch (err) {
      setVerifyError(
        err instanceof ApiError ? err.message : "Verification failed. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownload() {
    if (!recoveryCodes) return;
    const text =
      "Vorge MFA recovery codes\n" +
      "Keep these safe — they will not be shown again.\n\n" +
      recoveryCodes.join("\n") +
      "\n";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vorge-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="font-semibold tracking-tight text-primary">Vorge</div>
          <div className="ml-1 text-xs text-text-muted">SRA Platform</div>
        </div>

        {!recoveryCodes ? (
          <>
            <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-primary">
              Set up multi-factor authentication
            </h1>
            <p className="mb-8 text-sm text-text-muted">
              Scan the QR code in your authenticator app (1Password, Authy, Google Authenticator),
              then enter the 6-digit code below.
            </p>

            {startError ? (
              <Banner tone="danger" title="Couldn't load enrollment">
                {startError}
              </Banner>
            ) : null}

            {qrDataUrl ? (
              <div className="mb-6 rounded-md border border-border-default bg-surface-raised p-4">
                <img src={qrDataUrl} alt="MFA QR code" className="mx-auto h-48 w-48" />
                {manualKey ? (
                  <p className="mt-3 text-center text-xs text-text-muted">
                    Or enter this key manually: <code className="break-all font-mono">{manualKey}</code>
                  </p>
                ) : null}
              </div>
            ) : null}

            <form className="space-y-3" onSubmit={handleVerify} noValidate>
              <div>
                <label htmlFor="enrollCode" className="field-label mb-1.5 block">
                  Verification code
                </label>
                <input
                  id="enrollCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="field-control"
                  required
                />
              </div>

              {verifyError ? (
                <Banner tone="danger" title="Verification failed">
                  {verifyError}
                </Banner>
              ) : null}

              <button
                type="submit"
                className="btn-primary mt-2 w-full justify-center py-2.5"
                disabled={submitting || !code || !qrDataUrl}
              >
                {submitting ? "Verifying…" : "Verify and enroll"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-primary">
              Save your recovery codes
            </h1>
            <Banner tone="warning" title="You will not see these again">
              Store them in a password manager. Each code works once if you lose access to your
              authenticator.
            </Banner>
            <div className="mt-4 rounded-md border border-border-default bg-surface-raised p-3 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary mt-3 w-full justify-center py-2"
              onClick={handleDownload}
            >
              Download recovery-codes.txt
            </button>
            <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I have saved these codes somewhere safe.
            </label>
            <button
              type="button"
              className="btn-primary mt-4 w-full justify-center py-2.5"
              disabled={!acknowledged}
              onClick={() => navigate(getHomeRouteForRole(session.actingRole))}
            >
              Continue
            </button>
          </>
        )}

        <div className="mt-8 text-[11px] leading-relaxed text-text-disabled">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          MFA enrollment is logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
