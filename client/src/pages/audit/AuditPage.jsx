import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardHeader } from "../../components/Card";
import { Chip, RoleChip } from "../../components/Chip";
import { FormField, Select, TextInput } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import {
  filterAuditEntriesForRole,
  isAdminViewer,
  visibleIp
} from "../../features/audit/auditVisibility";

const BASE_ACTION_FILTERS = [
  "All",
  "edit",
  "create",
  "comment",
  "flag",
  "submit",
  "approve",
  "review-complete",
  "lock",
  "withdraw",
  "send-back-to-author",
  "send-back-to-reviewer",
  "reject",
  "mitigation-update"
];

const ADMIN_ACTION_FILTERS = ["sign-in"];

function formatTime(value) {
  if (!value) return "—";
  if (typeof value !== "string") return String(value);
  const dt = value.length > 10 ? value : `${value}T00:00:00Z`;
  const parsed = new Date(dt);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function AuditPage() {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [actionFilter, setActionFilter] = useState("All");
  const [search, setSearch] = useState("");

  const isAdmin = isAdminViewer(session.actingRole);
  const actionFilters = isAdmin
    ? [...BASE_ACTION_FILTERS, ...ADMIN_ACTION_FILTERS]
    : BASE_ACTION_FILTERS;

  const filtered = useMemo(() => {
    const visible = filterAuditEntriesForRole(workspace.audit, session.actingRole);
    return visible
      .filter((entry) => (actionFilter === "All" ? true : entry.action === actionFilter))
      .filter((entry) =>
        search
          ? `${entry.user} ${entry.detail} ${entry.assessment}`
              .toLowerCase()
              .includes(search.toLowerCase())
          : true
      );
  }, [workspace.audit, actionFilter, search, session.actingRole]);

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
            <Select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            >
              {actionFilters.map((option) => (
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
        <CardHeader
          eyebrow="Entries"
          title={`${filtered.length} matching entries`}
          description="Audit rows are append-only. No role can modify or delete an entry."
        />
        <ul className="mt-4 grid gap-3">
          {filtered.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{entry.action}</p>
                  <p className="mt-1 text-sm text-zinc-700">{entry.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{entry.facility}</span>
                    {entry.assessment && entry.assessment !== "—" ? (
                      <span>· {entry.assessment}</span>
                    ) : null}
                    {entry.section ? <Chip>{entry.section}</Chip> : null}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <span className="text-xs tabular-nums text-zinc-500">
                    {formatTime(entry.timestamp || entry.ts)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-700">{entry.user}</span>
                    <RoleChip role={entry.role} />
                  </div>
                  {visibleIp(session.actingRole, entry.ip) ? (
                    <span className="text-[10px] tabular-nums text-zinc-400">
                      IP {entry.ip}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
