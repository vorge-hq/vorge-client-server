import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Shield, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { ROLES, demoSession, getDemoPersona, isRoleMfaRequired } from "../../auth/session";
import { ApiError, apiRequest } from "../../api/client";
import { Banner } from "../../components/Banner";
import { FormField, TextInput } from "../../components/FormField";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { getHomeRouteForRole } from "../../features/navigation/navigation";

const SESSION_STORAGE_KEY = "vantage.session";
const TOKEN_STORAGE_KEY = "vantage.session.token";

const PERSONA_HINTS = {
  [ROLES.AUTHOR]: "Drafts and edits assessments; field mode and submissions.",
  [ROLES.REVIEWER]: "Comments and locks during In Review.",
  [ROLES.APPROVER]: "Final sign-off when Awaiting Approval.",
  [ROLES.HQ_EXECUTIVE]: "Portfolio view across facilities.",
  [ROLES.ADMIN]: "Configuration and audit access.",
  [ROLES.MITIGATION_OWNER]: "Tracks mitigations after approval only."
};

const STAGES = Object.freeze({
  CREDENTIALS: "credentials",
  ROLE_PICKER: "role-picker"
});

function buildSessionForRole(role, users) {
  const persona = getDemoPersona(role);
  const seed = users.find((user) => user.id === persona?.userId) || users[0];
  const facilityIds = Array.from(new Set(seed.roles.map((r) => r.facilityId)));
  const facilities = demoSession.facilities.filter((facility) =>
    facilityIds.includes(facility.id)
  );
  return {
    ...demoSession,
    user: {
      id: seed.id,
      name: persona?.name || seed.name,
      initials: persona?.initials || seed.initials,
      email: persona?.email || seed.email,
      title: persona?.title || seed.title,
      mfaEnabled: persona?.mfaEnabled ?? seed.mfaEnabled
    },
    facility: facilities[0] || demoSession.facilities[0],
    facilities: facilities.length ? facilities : demoSession.facilities,
    roles: Array.from(new Set(seed.roles.map((r) => r.role))),
    actingRole: role,
    mfaSatisfied: !isRoleMfaRequired(role) ? true : Boolean(seed.mfaEnabled || persona?.mfaEnabled),
    demo: true
  };
}

export function LoginPage() {
  if (isDemoEnabled()) {
    return <DemoLoginPage />;
  }
  return <ProdLoginPage />;
}

function DemoLoginPage() {
  const { login } = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [stage, setStage] = useState(STAGES.CREDENTIALS);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  function handleCredentials(event) {
    event.preventDefault();
    setError(null);
    setStage(STAGES.ROLE_PICKER);
  }

  function pickRole(role) {
    setError(null);
    // Demo mode never invokes MFA — chunk-4 locked decision #12 strips the
    // fake MFA stage from this demo path. Real MFA enforcement is prod-only.
    completeLogin(role);
  }

  function completeLogin(role) {
    const session = buildSessionForRole(role, workspace.users);
    login(session);
    const home =
      role === ROLES.MITIGATION_OWNER
        ? "/mitigations"
        : role === ROLES.ADMIN
          ? "/admin"
          : "/dashboard";
    navigate(home);
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

        <>
            <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-primary">
              Sign in to continue
            </h1>
            <p className="mb-8 text-sm text-zinc-500">
              Use your Vantage credentials.
            </p>

            <form className="space-y-3" onSubmit={handleCredentials}>
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
                />
              </div>
              <div>
                <label htmlFor="password" className="field-label mb-1.5 block">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="field-control"
                />
              </div>
              <button
                type="submit"
                className="btn-primary mt-2 w-full justify-center py-2.5"
              >
                Sign in
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-xs uppercase tracking-wider text-zinc-400">or</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>

            <button
              type="button"
              onClick={() => setStage(STAGES.ROLE_PICKER)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              <Sparkles size={14} className="text-zinc-500" aria-hidden />
              Demo bypass — skip sign-in
            </button>

            <div className="mt-8 text-[11px] leading-relaxed text-zinc-400">
              <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
              All sign-in attempts are logged to the immutable audit trail.
            </div>
          </>
      </div>

      {stage === STAGES.ROLE_PICKER ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-start justify-between">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900">
                Demo: choose a role
              </h2>
              <button
                type="button"
                onClick={() => setStage(STAGES.CREDENTIALS)}
                className="rounded p-1 hover:bg-zinc-100"
                aria-label="Close"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <p className="mb-5 text-sm text-zinc-500">
              For the demo, pick the role you want to enter as. The platform shows different surfaces per
              role.
            </p>
            <div className="space-y-2">
              {Object.values(ROLES).map((role) => {
                const persona = getDemoPersona(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => pickRole(role)}
                    className="group w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-10"
                  >
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-900">{role}</span>
                      <ArrowRight
                        size={14}
                        className="text-zinc-400 transition-all group-hover:text-zinc-700"
                        aria-hidden
                      />
                    </div>
                    <span className="text-xs text-zinc-500">
                      {persona?.name} — {PERSONA_HINTS[role]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ProdLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      const { token, user, actingRole, roles, facilities } = result;
      const mfaSatisfied = result.mfaSatisfied !== false;
      const mustReenroll = result.mustReenroll === true;
      const session = {
        user,
        facility: facilities?.[0] || null,
        facilities: facilities || [],
        roles: roles || [],
        actingRole,
        token,
        mfaSatisfied,
        mustReenroll,
        demo: false
      };

      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      }

      login(session);
      if (result.mfaRequired === true) {
        navigate(result.enrollmentNeeded ? "/mfa/enroll" : "/mfa/verify");
      } else {
        navigate(getHomeRouteForRole(actingRole));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.code === "INVALID_CREDENTIALS") {
        setError({ tone: "credentials", message: "Incorrect email or password." });
      } else {
        setError({ tone: "generic", message: "Something went wrong, try again." });
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
          Sign in to continue
        </h1>
        <p className="mb-8 text-sm text-zinc-500">Use your Vantage credentials.</p>

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
          <div>
            <label htmlFor="password" className="field-label mb-1.5 block">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              className="field-control"
              required
            />
          </div>

          {error ? (
            <Banner tone="danger" title={error.tone === "credentials" ? "Sign-in failed" : "Sign-in error"}>
              {error.message}
            </Banner>
          ) : null}

          <button
            type="submit"
            className="btn-primary mt-2 w-full justify-center py-2.5"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-zinc-500 hover:text-primary">
            Forgot password?
          </Link>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-zinc-400">
          <Lock size={11} className="mr-1 inline -mt-0.5" aria-hidden />
          All sign-in attempts are logged to the immutable audit trail.
        </div>
      </div>
    </main>
  );
}
