import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Banner } from "../../components/Banner";
import { Card, CardHeader } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { PageHeader } from "../../components/PageHeader";
import { Tabs } from "../../components/Tabs";
import {
  EXPORT_SECTIONS,
  MFA_POLICY,
  NOTIFICATION_TRIGGERS,
  OWNER_POOL
} from "../../data/admin";
import { LIBRARY_SEED } from "../../data/library";
import {
  CONSEQUENCE_AXES,
  CONSEQUENCE_LABELS,
  LIKELIHOOD_LABELS,
  RISK_BANDS,
  getBandClasses,
  getBandForScore
} from "../../features/assessmentWorkspace/riskMatrix";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";

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
  const { adminUsers } = useWorkspace();
  return (
    <Card>
      <CardHeader
        eyebrow="Identity"
        title="Users & role assignments"
        description="Manage platform users, role assignments, MFA status, and facility access."
        action={
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            style={{ background: "#1E3A5F", borderColor: "#1E3A5F" }}
          >
            <Plus size={14} aria-hidden /> Invite user
          </button>
        }
      />
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Roles</th>
              <th className="py-2 pr-4">Facilities</th>
              <th className="py-2 pr-4">MFA</th>
              <th className="py-2 pr-4">Last sign-in</th>
              <th className="py-2 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {adminUsers.map((user) => (
              <tr key={user.id} className="align-top">
                <td className="py-3 pr-4 font-semibold text-zinc-900">{user.name}</td>
                <td className="py-3 pr-4 text-zinc-700">{user.email}</td>
                <td className="py-3 pr-4 text-zinc-700">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Chip key={role}>{role}</Chip>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4 text-[12px] text-zinc-700">{user.facilities}</td>
                <td className="py-3 pr-4">
                  <Chip tone={user.mfa === "Enabled" ? "success" : "warn"}>{user.mfa}</Chip>
                </td>
                <td className="py-3 pr-4 text-[12px] text-zinc-500">{user.lastSignIn}</td>
                <td className="py-3 pr-4 text-right">
                  <button type="button" className="btn-secondary">
                    Edit
                  </button>
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
              <th className="border-b border-zinc-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Consequence \ Likelihood
              </th>
              {LIKELIHOOD_LABELS.map((label, index) => (
                <th
                  key={label}
                  className="border-b border-zinc-200 p-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {index + 1}. {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSEQUENCE_LABELS.map((label, severity) => (
              <tr key={label}>
                <th
                  scope="row"
                  className="border-b border-zinc-200 p-2 text-left text-xs font-semibold text-zinc-700"
                >
                  {severity}. {label}
                  <p className="text-[11px] font-normal text-zinc-500">{CONSEQUENCE_AXES.join(" · ")}</p>
                </th>
                {LIKELIHOOD_LABELS.map((__, likelihood) => {
                  const score = severity * (likelihood + 1);
                  const band = getBandForScore(score);
                  return (
                    <td key={likelihood} className="border-b border-zinc-200 p-2 text-center">
                      <span
                        className={`inline-flex h-12 w-full items-center justify-center rounded-lg text-xs font-semibold ${
                          band ? getBandClasses(band.id) : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
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
            <p className="mt-1 text-[11px] font-normal">
              Score {band.min} – {band.max}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LibrariesTab() {
  const libraries = [
    { id: "scenarios", name: "Scenarios", entries: LIBRARY_SEED.scenarios, description: "Used in Section 6 risk scenarios." },
    { id: "mitigations", name: "Mitigations", entries: LIBRARY_SEED.mitigations, description: "Used in Section 6 proposed mitigation." },
    { id: "vulnerabilities", name: "Vulnerabilities", entries: LIBRARY_SEED.vulnerabilities, description: "Used in Section 6 vulnerabilities." },
    { id: "controls", name: "Controls", entries: LIBRARY_SEED.controls, description: "Used in Section 6 existing controls." },
    { id: "consequences", name: "Consequences", entries: LIBRARY_SEED.consequences, description: "Used in Sections 3 and 6." }
  ];

  return (
    <Card>
      <CardHeader
        eyebrow="Reusable content"
        title="Library management"
        description="Add curated text suggestions analysts can pull into evaluations and assets."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {libraries.map((library) => (
          <div key={library.id} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-zinc-900">{library.name}</p>
              <Chip>{library.entries.length}</Chip>
            </div>
            <p className="mt-1 text-xs text-zinc-600">{library.description}</p>
            <ul className="mt-2 grid gap-1 text-[11px] text-zinc-600">
              {library.entries.slice(0, 3).map((entry) => (
                <li key={entry.id} className="truncate">
                  · {entry.text}
                </li>
              ))}
              {library.entries.length > 3 ? (
                <li className="text-[10px] text-zinc-400">+ {library.entries.length - 3} more</li>
              ) : null}
            </ul>
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
  return (
    <Card>
      <CardHeader
        eyebrow="Triggers"
        title="Notification triggers"
        description="Default Vantage triggers. Custom triggers and email templates ship in Phase 3."
      />
      <ul className="mt-4 grid gap-3">
        {NOTIFICATION_TRIGGERS.map((trigger) => (
          <li
            key={trigger.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-900">{trigger.event}</p>
              <p className="text-xs text-zinc-500">
                Recipients: {trigger.recipients} · Escalation: {trigger.escalation}
              </p>
            </div>
            <Chip tone={trigger.active ? "success" : "slate"}>
              {trigger.active ? "Active" : "Disabled"}
            </Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamsTab() {
  const { facilityAssignments } = useWorkspace();
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
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4">Facility</th>
              <th className="py-2 pr-4">Author</th>
              <th className="py-2 pr-4">Reviewer</th>
              <th className="py-2 pr-4">Approver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {facilityAssignments.map((row) => (
              <tr key={row.facility}>
                <td className="py-3 pr-4 font-semibold text-zinc-900">{row.facility}</td>
                <td className="py-3 pr-4 text-zinc-700">{row.author}</td>
                <td className="py-3 pr-4 text-zinc-700">{row.reviewer}</td>
                <td className="py-3 pr-4 text-zinc-700">{row.approver}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PoolTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Mitigation Owner Pool"
        title="Role label mappings"
        description="Updating a mapping reassigns all open mitigations to the new holder; previous holder loses access."
      />
      <ul className="mt-4 grid gap-3">
        {OWNER_POOL.map((mapping) => (
          <li
            key={mapping.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-zinc-900">{mapping.label}</p>
              <p className="text-xs text-zinc-500">
                {mapping.mappedTo}
                {mapping.email ? ` · ${mapping.email}` : ""}
              </p>
            </div>
            <button type="button" className="btn-secondary">
              Reassign
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MfaTab() {
  return (
    <Card>
      <CardHeader
        eyebrow="Authentication"
        title="MFA policy per role"
        description="The strictest policy across a user's roles applies. Offline access is governed separately."
      />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {MFA_POLICY.map((row) => (
          <li
            key={row.role}
            className="flex items-center justify-between rounded-xl border border-zinc-200 p-3"
          >
            <p className="text-sm font-semibold text-zinc-900">{row.role}</p>
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
      <ul className="mt-4 grid gap-2">
        {EXPORT_SECTIONS.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-[13px] font-semibold text-zinc-900">{row.section}</p>
            <p className="text-[11px] text-zinc-500">{row.binding}</p>
          </li>
        ))}
        <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-xs text-zinc-500">
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
