import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Shield, Sparkles, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { ROLES, demoSession, getDemoPersona, isRoleMfaRequired } from "../../auth/session";
import { Banner } from "../../components/Banner";
import { FormField, TextInput } from "../../components/FormField";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";

const PERSONA_HINTS = {
  [ROLES.AUTHOR]: "Drafts and edits assessments; field mode and submissions.",
  [ROLES.REVIEWER]: "Comments and locks during In Review.",
  [ROLES.APPROVER]: "Final sign-off when Awaiting Approval (MFA required).",
  [ROLES.HQ_EXECUTIVE]: "Portfolio view across facilities (MFA required).",
  [ROLES.ADMIN]: "Configuration and audit access (MFA required).",
  [ROLES.MITIGATION_OWNER]: "Tracks mitigations after approval only."
};

const STAGES = Object.freeze({
  CREDENTIALS: "credentials",
  ROLE_PICKER: "role-picker",
  MFA: "mfa"
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
  const { login } = useAuth();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [stage, setStage] = useState(STAGES.CREDENTIALS);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingRole, setPendingRole] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState(null);

  function handleCredentials(event) {
    event.preventDefault();
    setError(null);
    setStage(STAGES.ROLE_PICKER);
  }

  function pickRole(role) {
    setPendingRole(role);
    setError(null);
    if (isRoleMfaRequired(role)) {
      setStage(STAGES.MFA);
      return;
    }
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

  function handleMfa(event) {
    event.preventDefault();
    if (mfaCode.trim().length < 6) {
      setError("Enter the 6-digit code from your authenticator.");
      return;
    }
    if (!pendingRole) {
      setStage(STAGES.ROLE_PICKER);
      return;
    }
    setError(null);
    completeLogin(pendingRole);
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center p-6 text-zinc-900"
      style={{ background: "#F1F2F4", fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: "#1E3A5F" }}
          >
            <Shield size={15} strokeWidth={2.5} style={{ color: "#F59E0B" }} aria-hidden />
          </div>
          <div className="font-semibold tracking-tight" style={{ color: "#1E3A5F" }}>
            Vantage
          </div>
          <div className="ml-1 text-xs text-zinc-500">SRA Platform</div>
        </div>

        {stage === STAGES.MFA ? (
          <>
            <h1
              className="mb-1 text-[22px] font-semibold tracking-tight"
              style={{ color: "#1E3A5F" }}
            >
              Multi-factor authentication
            </h1>
            <p className="mb-8 text-sm text-zinc-500">
              Enter the 6-digit TOTP code to continue as {pendingRole}.
            </p>

            <form className="space-y-3" onSubmit={handleMfa}>
              <FormField label="Authentication code" htmlFor="mfa">
                <TextInput
                  id="mfa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  maxLength={7}
                />
              </FormField>

              {error ? (
                <Banner tone="danger" title="Code required">
                  {error}
                </Banner>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setStage(STAGES.ROLE_PICKER);
                    setError(null);
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
                >
                  Verify and continue
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1
              className="mb-1 text-[22px] font-semibold tracking-tight"
              style={{ color: "#1E3A5F" }}
            >
              Sign in to continue
            </h1>
            <p className="mb-8 text-sm text-zinc-500">
              Use your Vantage credentials. Approver, HQ Executive, and Admin roles require MFA per policy.
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
                style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
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
              MFA is enforced per role. All sign-in attempts are logged to the immutable audit trail.
            </div>
          </>
        )}
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
                    className="group w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-[#1E3A5F]/40 hover:bg-[#EFF4FB]/30"
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
                    {isRoleMfaRequired(role) ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <Lock size={9} aria-hidden /> MFA required
                      </span>
                    ) : null}
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
