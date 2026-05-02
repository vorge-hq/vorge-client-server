import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../components/Card";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";

const TILES = [
  { title: "Users & Roles", to: "/admin?tab=users", description: "Manage users, role assignments, and facility access." },
  { title: "Risk Matrix", to: "/admin?tab=matrix", description: "5×5 matrix configuration and risk band thresholds." },
  { title: "Libraries", to: "/admin?tab=libraries", description: "Scenarios, mitigations, vulnerabilities, controls, consequences." },
  { title: "Notifications", to: "/admin?tab=notifications", description: "Triggers, recipients, escalation rules." },
  { title: "Default Teams", to: "/admin?tab=teams", description: "Default Author / Reviewer / Approver per facility." },
  { title: "Mitigation Owner Pool", to: "/admin?tab=pool", description: "Map role labels (e.g. IT Director) to users." },
  { title: "MFA Policy", to: "/admin?tab=mfa", description: "Per-role MFA enforcement and offline access policy." },
  { title: "Export Template", to: "/admin?tab=export", description: "Standard SRA export bindings (Word/PDF)." }
];

export function AdminDashboard() {
  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Configuration overview"
        description="Configuration only — Admin cannot edit assessment analytical content."
        actions={
          <Link to="/admin" className="btn-primary">
            Open Admin
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active users" value={12} hint="Across all facilities" />
        <KpiCard label="MFA adoption" value="83%" tone="success" />
        <KpiCard label="Open audit queries" value={2} tone="warn" />
        <KpiCard label="Library entries" value={146} />
      </section>

      <Card>
        <CardHeader eyebrow="Surfaces" title="Configuration surfaces" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((tile) => (
            <Link
              key={tile.title}
              to={tile.to}
              className="focus-ring block rounded-xl border border-slate-200 p-4 transition hover:border-vantage-navy hover:shadow-card"
            >
              <p className="font-semibold text-slate-900">{tile.title}</p>
              <p className="mt-1 text-sm text-slate-600">{tile.description}</p>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
