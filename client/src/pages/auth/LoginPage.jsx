import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { demoSession } from "../../auth/session";
import { Banner } from "../../components/Banner";
import { FormField, Select, TextInput } from "../../components/FormField";
import { USERS } from "../../data/users";

const STAGES = Object.freeze({ CREDENTIALS: "credentials", MFA: "mfa" });

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState(STAGES.CREDENTIALS);
  const [selectedUserId, setSelectedUserId] = useState(USERS[0].id);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState(null);

  const selectedUser = USERS.find((user) => user.id === selectedUserId) || USERS[0];

  function handleCredentials(event) {
    event.preventDefault();
    setError(null);
    if (selectedUser.mfaEnabled) {
      setStage(STAGES.MFA);
      return;
    }
    completeLogin();
  }

  function handleMfa(event) {
    event.preventDefault();
    if (mfaCode.trim().length < 6) {
      setError("Enter the 6-digit code from your authenticator.");
      return;
    }
    setError(null);
    completeLogin();
  }

  function completeLogin() {
    const facilityIds = Array.from(new Set(selectedUser.roles.map((r) => r.facilityId)));
    const facilities = demoSession.facilities.filter((facility) =>
      facilityIds.includes(facility.id)
    );
    const session = {
      ...demoSession,
      user: {
        id: selectedUser.id,
        name: selectedUser.name,
        initials: selectedUser.initials,
        email: selectedUser.email,
        title: selectedUser.title,
        mfaEnabled: selectedUser.mfaEnabled
      },
      facility: facilities[0] || demoSession.facilities[0],
      facilities: facilities.length ? facilities : demoSession.facilities,
      roles: Array.from(new Set(selectedUser.roles.map((r) => r.role))),
      actingRole: selectedUser.actingRole,
      mfaSatisfied: true
    };
    login(session);
    navigate("/dashboard");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-vantage-navy px-4 py-10 text-white">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-stretch">
        <section className="hidden flex-col justify-between rounded-3xl border border-white/10 bg-vantage-ink p-10 lg:flex">
          <header>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-2xl font-bold text-white">
              V
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight">Vantage</h1>
            <p className="mt-3 max-w-md text-base text-white/80">
              Audit-defensible Security Risk Assessments for refineries, terminals, FPSOs, ports, and
              critical infrastructure.
            </p>
          </header>
          <ul className="grid gap-3 text-sm text-white/80">
            <li className="rounded-xl border border-white/10 bg-white/5 p-3">
              Multi-role workflow: Author → Reviewer → Approver, with audited send-backs and rejections.
            </li>
            <li className="rounded-xl border border-white/10 bg-white/5 p-3">
              Section 6 evaluations are linked to mitigations tracked via the Mitigation Owner workflow.
            </li>
            <li className="rounded-xl border border-white/10 bg-white/5 p-3">
              Field mode with per-section checkout, offline PIN/biometric auth, and clean sync.
            </li>
          </ul>
        </section>

        <section className="rounded-3xl bg-white p-7 text-slate-900 shadow-elevated sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-vantage-blue">Vantage</p>
          {stage === STAGES.CREDENTIALS ? (
            <>
              <h2 className="mt-2 text-2xl font-bold">Sign in</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use platform credentials. Single sign-on via SAML / OIDC is intentionally out of scope.
              </p>

              <form className="mt-6 grid gap-4" onSubmit={handleCredentials}>
                <FormField
                  label="Email"
                  htmlFor="email"
                  hint="Use the demo selector below to switch personas."
                >
                  <TextInput
                    id="email"
                    type="email"
                    value={selectedUser.email}
                    onChange={() => undefined}
                    readOnly
                  />
                </FormField>

                <FormField label="Password" htmlFor="password">
                  <TextInput
                    id="password"
                    type="password"
                    defaultValue="VantageDemo123!"
                    autoComplete="current-password"
                  />
                </FormField>

                <FormField label="Demo persona" htmlFor="persona" hint="For walkthrough purposes only.">
                  <Select
                    id="persona"
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    {USERS.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} — {user.title}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <button type="submit" className="btn-primary mt-2 w-full">
                  Continue
                </button>
                <p className="text-center text-xs text-slate-500">
                  Forgot your password? Reset via email verification (server-driven).
                </p>
              </form>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-2xl font-bold">Multi-factor authentication</h2>
              <p className="mt-2 text-sm text-slate-600">
                Enter the 6-digit TOTP code for {selectedUser.email}.
              </p>

              <form className="mt-6 grid gap-4" onSubmit={handleMfa}>
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

                {error ? <Banner tone="danger" title="Code required">{error}</Banner> : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setStage(STAGES.CREDENTIALS);
                      setError(null);
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="btn-primary">
                    Verify and continue
                  </button>
                </div>
                <p className="text-center text-xs text-slate-500">
                  Approver, HQ Executive, and Admin roles require MFA per default policy.
                </p>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
