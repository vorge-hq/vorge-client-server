import { useMemo, useState } from "react";
import { Activity, ChevronDown, Lock, X } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import {
  filterAuditEntriesForRole,
  isAdminViewer,
  visibleIp
} from "../../audit/auditVisibility";
import { SRA_SECTIONS } from "../assessmentModel";

const BASE_FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "edits", label: "Edits" },
  { id: "creates", label: "Creates" },
  { id: "comments", label: "Comments" },
  { id: "advisory", label: "Advisory" }
];

const ADMIN_FILTER_TABS = [
  { id: "sign-ins", label: "Sign-ins" },
  { id: "system", label: "System / AI" }
];

const ACTION_STYLES = {
  edit: { color: "#1e40af", bg: "#eff6ff", label: "Edit" },
  create: { color: "#065f46", bg: "#ecfdf5", label: "Create" },
  comment: { color: "#7c3aed", bg: "#f5f3ff", label: "Comment" },
  flag: { color: "#9a3412", bg: "#fff7ed", label: "AI flag" },
  "sign-in": { color: "#52525b", bg: "#f4f4f5", label: "Sign-in" },
  submit: { color: "#a16207", bg: "#fefce8", label: "Submit" },
  approve: { color: "#065f46", bg: "#ecfdf5", label: "Approve" },
  "review-complete": { color: "#1e40af", bg: "#eff6ff", label: "Review complete" },
  lock: { color: "#52525b", bg: "#f4f4f5", label: "Lock" },
  withdraw: { color: "#9a3412", bg: "#fff7ed", label: "Withdraw" },
  "recall-request": { color: "#9a3412", bg: "#fff7ed", label: "Recall request" },
  "send-back-to-author": { color: "#9a3412", bg: "#fff7ed", label: "Send-back → Author" },
  "send-back-to-reviewer": { color: "#9a3412", bg: "#fff7ed", label: "Send-back → Reviewer" },
  reject: { color: "#991b1b", bg: "#fef2f2", label: "Reject" },
  "mitigation-update": { color: "#0f766e", bg: "#ecfdf5", label: "Mitigation update" },
  "matrix-tick": { color: "#065f46", bg: "#ecfdf5", label: "Matrix tick" },
  "matrix-untick": { color: "#9a3412", bg: "#fff7ed", label: "Matrix untick" }
};

function formatTimestamp(ts) {
  if (!ts) return "—";
  if (typeof ts !== "string") return String(ts);
  if (ts.length <= 19) return ts.replace("T", " ");
  return ts.slice(0, 19).replace("T", " ");
}

export function AuditLogPanel({
  entries = [],
  assessmentName = "Eko Petrochemical Hub — 2026 SRA",
  onClose,
  initialFilter = "all",
  initialSectionId = null
}) {
  const { session } = useAuth();
  const [filter, setFilter] = useState(initialFilter);
  const [sectionFilter, setSectionFilter] = useState(initialSectionId ?? null);
  const [expanded, setExpanded] = useState(null);

  const isAdmin = isAdminViewer(session.actingRole);
  const filterTabs = isAdmin ? [...BASE_FILTER_TABS, ...ADMIN_FILTER_TABS] : BASE_FILTER_TABS;

  const visibleEntries = useMemo(
    () => filterAuditEntriesForRole(entries, session.actingRole),
    [entries, session.actingRole]
  );

  const filtered = useMemo(() => {
    let pool = visibleEntries;
    if (sectionFilter != null) {
      pool = pool.filter((e) => e.sectionId === sectionFilter);
    }
    if (filter === "all") return pool;
    if (filter === "edits") return pool.filter((e) => e.action === "edit");
    if (filter === "creates") return pool.filter((e) => e.action === "create");
    if (filter === "comments") return pool.filter((e) => e.action === "comment");
    if (filter === "advisory") {
      return pool.filter((e) => e.action === "comment" && e.commentKind === "advisory");
    }
    if (filter === "sign-ins") return pool.filter((e) => e.action === "sign-in");
    if (filter === "system") {
      return pool.filter((e) => (e.user || "").includes("System") || e.action === "flag");
    }
    return pool;
  }, [visibleEntries, filter, sectionFilter]);

  const sectionLabel =
    sectionFilter != null
      ? SRA_SECTIONS.find((s) => s.id === sectionFilter)?.label || `Section ${sectionFilter}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-zinc-900/30 backdrop-blur-[2px]" />
      <div
        className="flex w-full max-w-[560px] flex-col border-l border-border-default bg-surface-raised shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border-subtle px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-text-secondary" />
              <span className="text-[14px] font-semibold">Audit log</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                <Lock size={9} /> Immutable
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {assessmentName} · {entries.length} entries · Retained for 7 years
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-surface-muted" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border-subtle px-5 py-2.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              type="button"
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === tab.id
                  ? "bg-zinc-700 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {sectionFilter != null ? (
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-primary-50 px-5 py-2 text-[11px] text-primary dark:bg-primary-900/40">
            <span>
              Filtered to <span className="font-semibold">{sectionLabel}</span>
              {filter === "comments" ? " comments" : ""}
            </span>
            <button
              type="button"
              onClick={() => setSectionFilter(null)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-surface-raised"
            >
              <X size={11} aria-hidden /> Clear filter
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-text-muted">No entries match the filter.</div>
          ) : null}
          {filtered.map((entry) => {
            const style = ACTION_STYLES[entry.action] || ACTION_STYLES.edit;
            const isExpanded = expanded === entry.id;
            const hasDetail = Boolean(entry.detail);
            return (
              <div key={entry.id} className="border-b border-border-subtle hover:bg-surface-muted/40">
                <button
                  type="button"
                  onClick={() => hasDetail && setExpanded(isExpanded ? null : entry.id)}
                  className={`w-full px-5 py-3 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-28 shrink-0 text-[10px] tabular-nums leading-relaxed text-text-disabled">
                      {formatTimestamp(entry.timestamp || entry.ts)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-text-primary">{entry.user}</span>
                        <span className="text-[10px] text-text-muted">({entry.role})</span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color: style.color, background: style.bg }}
                        >
                          {style.label}
                        </span>
                        {entry.action === "comment" && entry.commentKind === "advisory" ? (
                          <span className="rounded border border-border-default bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                            Advisory
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[12px] leading-snug text-text-secondary">
                        {entry.assessment ? `${entry.assessment} — ` : ""}
                        {entry.detail || entry.action}
                      </div>
                      {visibleIp(session.actingRole, entry.ip) ? (
                        <div className="mt-0.5 text-[10px] tabular-nums text-text-disabled">
                          IP {entry.ip}
                        </div>
                      ) : null}
                    </div>
                    {hasDetail ? (
                      <ChevronDown
                        size={14}
                        className={`mt-1 text-text-disabled transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    ) : null}
                  </div>
                </button>
                {isExpanded && hasDetail ? (
                  <div className="bg-surface-muted/60 px-5 pb-3 pl-[140px]">
                    <div className="rounded-md border border-border-default bg-surface-raised p-2.5 text-[11px] text-text-secondary">
                      {entry.detail}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-muted/40 px-5 py-3 text-[11px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <Lock size={11} aria-hidden /> No role can modify or delete entries
          </div>
          <button
            type="button"
            className="font-medium text-primary hover:text-primary-600"
            onClick={() => alert("Audit log exported to CSV. Export action recorded to audit trail.")}
          >
            Export CSV →
          </button>
        </div>
      </div>
    </div>
  );
}
