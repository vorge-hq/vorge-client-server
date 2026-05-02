import { useMemo, useState } from "react";
import { Card, CardHeader } from "../../components/Card";
import { Chip, RoleChip } from "../../components/Chip";
import { FormField, Select, TextInput } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { AUDIT_LOG } from "../../data/auditLog";

const ACTION_FILTERS = [
  "All",
  "Submitted for review",
  "Marked review complete",
  "Comment added",
  "Field locked",
  "Mitigation status updated",
  "AI call: Drafted summary",
  "Configuration change",
  "Section saved"
];

export function AuditPage() {
  const [actionFilter, setActionFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return AUDIT_LOG.filter((entry) =>
      actionFilter === "All" ? true : entry.action === actionFilter
    ).filter((entry) =>
      search
        ? `${entry.user} ${entry.detail} ${entry.assessment}`.toLowerCase().includes(search.toLowerCase())
        : true
    );
  }, [actionFilter, search]);

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Audit"
        title="Audit log"
        description="Immutable record of platform actions. Admin access to facility-specific logs requires a reason."
      />

      <Card>
        <CardHeader eyebrow="Filters" title="Filter the audit log" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <FormField label="Search">
            <TextInput
              type="search"
              placeholder="Search user, action, detail…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="Action">
            <Select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              {ACTION_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Date range">
            <Select defaultValue="last-30">
              <option value="last-7">Last 7 days</option>
              <option value="last-30">Last 30 days</option>
              <option value="last-90">Last 90 days</option>
              <option value="all">All time</option>
            </Select>
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Entries" title={`${filtered.length} matching entries`} />
        <ul className="mt-4 grid gap-3">
          {filtered.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{entry.action}</p>
                  <p className="mt-1 text-sm text-slate-700">{entry.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{entry.facility}</span>
                    {entry.assessment !== "—" ? <span>· {entry.assessment}</span> : null}
                    <Chip>{entry.section}</Chip>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <span className="text-xs text-slate-500">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{entry.user}</span>
                    <RoleChip role={entry.role} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
