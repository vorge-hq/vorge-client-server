import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Lock, Shield } from "lucide-react";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";

export function ForgotPasswordPage() {
  if (isDemoEnabled()) {
    return <Navigate to="/login" replace />;
  }

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: "Unable to submit request. Please try again." });
      } else {
        setError({ message: "Unable to submit request. Please try again." });
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
          Reset your password
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          Enter the email tied to your Vantage account. If it&rsquo;s registered, we&rsquo;ll send a reset link.
        </p>

        {submitted ? (
          <Banner tone="success" title="Check your inbox">
            If that email is registered, a reset link has been sent. It expires in one hour.
          </Banner>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="field-label mb-1.5 block">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="you@company.com"
                className="field-control"
                required
              />
            </div>

            {error ? (
              <Banner tone="danger" title="Request failed">
                {error.message}
              </Banner>
            ) : null}

            <button
              type="submit"
              className="btn-primary mt-2 w-full justify-center py-2.5"
              disabled={submitting || !email}
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-zinc-500 hover:text-primary">
            Back to sign in
          </Link>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-zinc-400">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          Password-reset requests are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
