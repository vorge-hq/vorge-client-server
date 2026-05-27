import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { isDemoEnabled } from "../../auth/demoFlag";
import { Banner } from "../../components/Banner";

function formatRemaining(ms) {
  if (!ms || ms <= 0) return "0s";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export function MfaLockoutPage() {
  if (isDemoEnabled()) return <Navigate to="/login" replace />;

  const location = useLocation();
  const { remainingMs, tier } = location.state || {};
  const [now, setNow] = useState(Date.now());
  const isAdminReset = tier === "24h_admin_reset";
  const targetEpoch = remainingMs ? Date.now() + remainingMs : null;

  useEffect(() => {
    if (!targetEpoch) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetEpoch]);

  const remaining = targetEpoch ? Math.max(0, targetEpoch - now) : 0;

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
          Sign-in temporarily blocked
        </h1>

        {isAdminReset ? (
          <Banner tone="danger" title="Contact your administrator">
            Too many failed verification attempts. An administrator must reset your MFA before you
            can try again.
          </Banner>
        ) : (
          <Banner tone="warning" title="Try again later">
            Too many failed verification attempts. You can retry in{" "}
            <strong>{formatRemaining(remaining)}</strong>.
          </Banner>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-zinc-500 hover:text-primary">
            Back to sign in
          </Link>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-zinc-400">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          Lockout events are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
