import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banner } from "../../components/Banner";
import { Card, CardHeader } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/icons";
import { PageHeader } from "../../components/PageHeader";
import { Tabs } from "../../components/Tabs";
import { USERS } from "../../data/users";
import {
  CONSEQUENCE_AXES,
  CONSEQUENCE_LABELS,
  LIKELIHOOD_LABELS,
  RISK_BANDS,
  getBandClasses,
  getBandForScore
} from "../../features/assessmentWorkspace/riskMatrix";

const TABS = [
  { id: "users", label: "Users & Roles" },
  { id: "matrix", label: "Risk Matrix" },
  { id: "libraries", label: "Libraries" },
  { id: "notifications", label: "Notifications" },
  { id: "teams", label: "Default Teams" },
  { id: "pool", label: "Mitigation Pool" },
  { id: "mfa", label: "MFA Policy" },
  { id: "export", label: "Export Template" }
];

function UsersTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Identity"
        title="Users & role assignments"
        description="Manage platform users, role assignments, MFA status, and facility access."
        action={
          <button type="button" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> Invite user
          </button>
        }
      />
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Roles</th>
              <th className="py-2 pr-4">MFA</th>
              <th className="py-2 pr-4">Last sign-in</th>
              <th className="py-2 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {USERS.map((user) => (
              <tr key={user.id} className="align-top">
                <td className="py-3 pr-4 font-semibold text-slate-900">{user.name}</td>
                <td className="py-3 pr-4 text-slate-700">{user.email}</td>
                <td className="py-3 pr-4 text-slate-700">
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(user.roles.map((r) => r.role))).map((role) => (
                      <Chip key={role}>{role}</Chip>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Chip tone={user.mfaEnabled ? "success" : "warn"}>
                    {user.mfaEnabled ? "Enabled" : "Not enabled"}
                  </Chip>
                </td>
                <td className="py-3 pr-4 text-slate-700">2 hours ago</td>
                <td className="py-3 pr-4 text-right">
                  <button type="button" className="btn-secondary">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MatrixTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Calibration"
        title="Risk matrix configuration"
        description="Per-facility 5×5 matrix. Approved assessments freeze a snapshot at approval time."
      />
      <Banner tone="info" title="Calibration changes are audited">
        Editing band thresholds writes to the audit log and notifies Authors and Approvers.
      </Banner>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Consequence \ Likelihood
              </th>
              {LIKELIHOOD_LABELS.map((label, index) => (
                <th key={label} className="border-b border-slate-200 p-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {index + 1}. {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSEQUENCE_LABELS.map((label, severity) => (
              <tr key={label}>
                <th scope="row" className="border-b border-slate-200 p-2 text-left text-xs font-semibold text-slate-700">
                  {severity}. {label}
                  <p className="text-[11px] font-normal text-slate-500">{CONSEQUENCE_AXES.join(" · ")}</p>
                </th>
                {LIKELIHOOD_LABELS.map((__, likelihood) => {
                  const score = severity * (likelihood + 1);
                  const band = getBandForScore(score);
                  return (
                    <td key={likelihood} className="border-b border-slate-200 p-2 text-center">
                      <span className={`inline-flex h-12 w-full items-center justify-center rounded-lg text-xs font-semibold ${band ? getBandClasses(band.id) : "bg-slate-100 text-slate-500"}`}>
                        {severity === 0 ? "—" : score}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-4">
        {Object.values(RISK_BANDS).map((band) => (
          <li key={band.id} className={`rounded-xl p-3 text-xs font-semibold ${band.fg} ${band.bg}`}>
            <p>{band.id}</p>
            <p className="mt-1 text-[11px] font-normal">Score {band.min} – {band.max}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LibrariesTab() {
  const libraries = [
    { id: "scenarios", name: "Scenarios", count: 28, description: "Used in Section 6 risk scenarios." },
    { id: "mitigations", name: "Mitigations", count: 32, description: "Used in Section 6 proposed mitigation." },
    { id: "vulnerabilities", name: "Vulnerabilities", count: 41, description: "Used in Section 6 vulnerabilities." },
    { id: "controls", name: "Controls", count: 18, description: "Used in Section 6 existing controls." },
    { id: "consequences", name: "Consequences", count: 27, description: "Used in Sections 3 and 6." }
  ];
  return (
    <Card>
      <CardHeader eyebrow="Reusable content" title="Library management" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {libraries.map((library) => (
          <div key={library.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">{library.name}</p>
              <Chip>{library.count}</Chip>
            </div>
            <p className="mt-1 text-xs text-slate-600">{library.description}</p>
            <button type="button" className="btn-secondary mt-3 w-full justify-center">
              Manage entries
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotificationsTab() {
  const triggers = [
    { id: "submitted", label: "Assessment submitted", recipients: "Reviewer", active: true },
    { id: "complete", label: "Review complete", recipients: "Approver, Author", active: true },
    { id: "approved", label: "Assessment approved", recipients: "Author, Reviewer, HQ", active: true },
    { id: "overdue", label: "Mitigation overdue", recipients: "Mitigation Owner, Approver", active: true },
    { id: "comment", label: "Comments added", recipients: "Author", active: true },
    { id: "lock", label: "Lock applied", recipients: "Author", active: true },
    { id: "ai", label: "AI flag raised", recipients: "Author", active: false },
    { id: "version", label: "Version created", recipients: "HQ Executive", active: true }
  ];

  return (
    <Card>
      <CardHeader eyebrow="Triggers" title="Notification triggers" />
      <ul className="mt-4 grid gap-3">
        {triggers.map((trigger) => (
          <li key={trigger.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{trigger.label}</p>
              <p className="text-xs text-slate-500">Recipients: {trigger.recipients}</p>
            </div>
            <Chip tone={trigger.active ? "success" : "slate"}>{trigger.active ? "Active" : "Disabled"}</Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamsTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Defaults"
        title="Default assessment teams"
        description="Pre-populates Document Approvals on new assessments per facility."
      />
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Facility</th>
              <th className="py-2 pr-4">Author</th>
              <th className="py-2 pr-4">Reviewer</th>
              <th className="py-2 pr-4">Approver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="py-3 pr-4 font-semibold text-slate-900">Bonny Refinery</td>
              <td className="py-3 pr-4 text-slate-700">Omar Haddad</td>
              <td className="py-3 pr-4 text-slate-700">Sarah Okonkwo</td>
              <td className="py-3 pr-4 text-slate-700">Marcus King</td>
            </tr>
            <tr>
              <td className="py-3 pr-4 font-semibold text-slate-900">Coral FPSO</td>
              <td className="py-3 pr-4 text-slate-700">Omar Haddad</td>
              <td className="py-3 pr-4 text-slate-700">Sarah Okonkwo</td>
              <td className="py-3 pr-4 text-slate-700">— (TBD)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PoolTab() {
  const mappings = [
    { label: "Security Manager", user: "James Clark", openMitigations: 3 },
    { label: "IT Director", user: "James Clark", openMitigations: 2 },
    { label: "Operations Lead", user: "James Clark", openMitigations: 0 }
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="Mitigation Owner Pool"
        title="Role label mappings"
        description="Updating a mapping reassigns all open mitigations to the new holder; previous holder loses access."
      />
      <ul className="mt-4 grid gap-3">
        {mappings.map((mapping) => (
          <li
            key={mapping.label}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{mapping.label}</p>
              <p className="text-xs text-slate-500">{mapping.user}</p>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone="info">{mapping.openMitigations} open</Chip>
              <button type="button" className="btn-secondary">Reassign</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MfaTab() {
  const policy = [
    { role: "Author", required: false },
    { role: "Reviewer", required: false },
    { role: "Approver", required: true },
    { role: "HQ Executive", required: true },
    { role: "Admin", required: true },
    { role: "Mitigation Owner", required: false }
  ];
  return (
    <Card>
      <CardHeader
        eyebrow="Authentication"
        title="MFA policy per role"
        description="The strictest policy across a user's roles applies. Offline access is governed separately."
      />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {policy.map((row) => (
          <li
            key={row.role}
            className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
          >
            <p className="text-sm font-semibold text-slate-900">{row.role}</p>
            <Chip tone={row.required ? "info" : "slate"}>
              {row.required ? "MFA required" : "Optional"}
            </Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExportTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Document export"
        title="Standard SRA export template"
        description="Maps assessment data to Word/PDF. Custom templates are a Phase 3 add-on."
      />
      <ul className="mt-4 grid gap-3">
        <li className="rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">Section bindings</p>
          <p className="text-xs text-slate-500">9 sections mapped, includes Document Approvals front matter.</p>
        </li>
        <li className="rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">Watermarking</p>
          <p className="text-xs text-slate-500">Draft exports watermarked. Approved exports frozen.</p>
        </li>
        <li className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
          Custom templates upload — coming in Phase 3.
        </li>
      </ul>
    </Card>
  );
}

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "users";
  const setTab = (id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      return next;
    });
  };

  const content = useMemo(() => {
    switch (tab) {
      case "matrix":
        return <MatrixTab />;
      case "libraries":
        return <LibrariesTab />;
      case "notifications":
        return <NotificationsTab />;
      case "teams":
        return <TeamsTab />;
      case "pool":
        return <PoolTab />;
      case "mfa":
        return <MfaTab />;
      case "export":
        return <ExportTab />;
      case "users":
      default:
        return <UsersTab />;
    }
  }, [tab]);

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Configuration"
        description="Configuration only. Admins cannot edit assessment analytical content. All changes are audited."
      />
      <Tabs tabs={TABS} activeId={tab} onChange={setTab} ariaLabel="Admin sections" />
      {content}
    </section>
  );
}
