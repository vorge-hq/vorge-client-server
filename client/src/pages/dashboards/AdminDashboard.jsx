import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Layers,
  MessageSquare,
  Settings,
  Users
} from "lucide-react";
import { OWNER_POOL } from "../../data/admin";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";

function AdminTile({ Icon: TileIcon, title, description, count, to }) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-primary-200 hover:bg-primary-10"
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-10 text-primary">
          <TileIcon size={16} />
        </div>
        <span className="text-[14px] font-semibold text-zinc-900">{title}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-zinc-600">{description}</p>
      {count != null ? (
        <p className="mt-2 text-[11px] font-medium text-zinc-500">{count}</p>
      ) : null}
    </Link>
  );
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { adminUsers, facilityAssignments } = workspace;

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Facility administration
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            People, roles, default assignments, and platform configuration for this facility.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold text-secondary-800">
          <Settings size={10} aria-hidden /> Facility: Lagos Refinery
        </span>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminTile
          Icon={Settings}
          title="Configuration"
          description="Risk matrix, threats, consequence axes, risk band thresholds."
          count="6 platform parameters"
          to="/admin?tab=matrix"
        />
        <AdminTile
          Icon={BookOpen}
          title="Library"
          description="Reusable scenarios, mitigations, vulnerabilities, controls, consequences."
          count="32 entries · 5 categories"
          to="/admin?tab=libraries"
        />
        <AdminTile
          Icon={MessageSquare}
          title="Notifications"
          description="Triggers and recipients for workflow events."
          count="8 active triggers"
          to="/admin?tab=notifications"
        />
        <AdminTile
          Icon={FileText}
          title="Export template"
          description="Standard SRA Word/PDF template with section bindings."
          count="1 active template"
          to="/admin?tab=export"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white lg:col-span-2">
          <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users size={13} className="text-zinc-700" />
              <span className="text-[13px] font-semibold text-zinc-900">Users & roles</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/admin?tab=users")}
              className="text-[11px] font-medium text-primary hover:text-primary-600"
            >
              Manage users →
            </button>
          </header>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50/60">
              <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Roles</th>
                <th className="px-3 py-2 text-left">Facilities</th>
                <th className="px-3 py-2 text-left">MFA</th>
                <th className="px-3 py-2 text-left">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.slice(0, 6).map((user) => (
                <tr key={user.id} className="border-t border-zinc-100 hover:bg-zinc-50/40">
                  <td className="px-3 py-2 text-[12px]">
                    <div className="font-medium text-zinc-900">{user.name}</div>
                    <div className="text-[10px] text-zinc-500">{user.email}</div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-zinc-700">{user.roles.join(", ")}</td>
                  <td className="px-3 py-2 text-[11px] text-zinc-600">{user.facilities}</td>
                  <td className="px-3 py-2 text-[11px]">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                        user.mfa === "Enabled"
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {user.mfa}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-zinc-500">{user.lastSignIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white">
          <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers size={13} className="text-zinc-700" />
              <span className="text-[13px] font-semibold text-zinc-900">Default teams</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/admin?tab=teams")}
              className="text-[11px] font-medium text-primary hover:text-primary-600"
            >
              Manage →
            </button>
          </header>
          <ul className="divide-y divide-zinc-100">
            {facilityAssignments.map((row) => (
              <li key={row.facility} className="px-4 py-2.5 text-[12px]">
                <p className="font-medium text-zinc-900">{row.facility}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Author: {row.author} · Reviewer: {row.reviewer} · Approver: {row.approver}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-zinc-700" />
            <span className="text-[13px] font-semibold text-zinc-900">Mitigation owner pool</span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin?tab=pool")}
            className="text-[11px] font-medium text-primary hover:text-primary-600"
          >
            Edit pool →
          </button>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/60">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 text-left">Pool label</th>
              <th className="px-3 py-2 text-left">Mapped to</th>
              <th className="px-3 py-2 text-left">Email</th>
            </tr>
          </thead>
          <tbody>
            {OWNER_POOL.map((row) => (
              <tr key={row.id} className="border-t border-zinc-100">
                <td className="px-3 py-2 text-[12px] font-medium">{row.label}</td>
                <td className="px-3 py-2 text-[12px] text-zinc-700">{row.mappedTo}</td>
                <td className="px-3 py-2 text-[11px] text-zinc-500">{row.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
