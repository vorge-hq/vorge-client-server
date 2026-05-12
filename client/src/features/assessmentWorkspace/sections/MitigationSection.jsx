import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Info } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { ROLES } from "../../../auth/session";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { OWNER_POOL } from "../../../data/admin";
import { generateMitigations } from "../../../data/mitigations";
import { ASSESSMENT_STATES } from "../assessmentModel";
import { calculateRisk } from "../riskMatrix";
import { useWorkspace } from "../WorkspaceContext";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const SEVERITY_BAND_TOKENS = {
  Low: {
    chip: "bg-severity-low-bg text-severity-low-text border-severity-low-fill",
    fill: "bg-severity-low-fill"
  },
  Medium: {
    chip: "bg-severity-medium-bg text-severity-medium-text border-severity-medium-fill",
    fill: "bg-severity-medium-fill"
  },
  High: {
    chip: "bg-severity-high-bg text-severity-high-text border-severity-high-fill",
    fill: "bg-severity-high-fill"
  },
  "Very High": {
    chip: "bg-severity-very-high-bg text-severity-very-high-text border-severity-very-high-fill",
    fill: "bg-severity-very-high-fill"
  }
};

const STATUS_TOKENS = {
  Open: {
    chip: "bg-surface-muted text-text-secondary",
    fill: "bg-gray-300"
  },
  "In Progress": {
    chip: "bg-primary-50 text-primary-700",
    fill: "bg-info"
  },
  Done: {
    chip: "bg-severity-low-bg text-severity-low-text",
    fill: "bg-severity-low-fill"
  },
  Cancelled: {
    chip: "bg-surface-sunken text-text-muted",
    fill: "bg-gray-200"
  }
};

const OWNER_LABELS = OWNER_POOL.map((o) => o.label);

function StatCard({ label, value, sub, tone = "default" }) {
  const valueClass = tone === "warn" && value > 0 ? "text-amber-700" : "text-text-primary";
  return (
    <div className="rounded-lg border border-border-default bg-surface-raised px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const tokens = STATUS_TOKENS[status] || STATUS_TOKENS.Open;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${tokens.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tokens.fill}`} />
      {status}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const tokens = SEVERITY_BAND_TOKENS[severity] || SEVERITY_BAND_TOKENS.Medium;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${tokens.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tokens.fill}`} />
      {severity}
    </span>
  );
}

function isOverdue(targetDate, status) {
  if (!targetDate) return false;
  if (status === "Done" || status === "Cancelled") return false;
  return new Date(targetDate) < new Date();
}

function buildMitigationView(mitigations, evaluations, activeAssessmentId) {
  const byEvalId = new Map(mitigations.map((m) => [m.evaluationId, m]));
  return evaluations
    .filter((evaluation) => (evaluation.proposedMitigation || "").trim().length > 0)
    .map((evaluation, index) => {
      const stored = byEvalId.get(evaluation.id);
      if (stored) {
        return {
          ...stored,
          mitigation: evaluation.proposedMitigation || stored.description || "—",
          severity:
            calculateRisk(evaluation.consequenceR1, evaluation.likelihoodR1).band ||
            stored.severity ||
            "Medium",
          assetId: evaluation.assetId,
          threatId: evaluation.threatId
        };
      }
      const generated = generateMitigations([evaluation], activeAssessmentId)[0];
      return {
        ...generated,
        id: `m-derived-${evaluation.id}-${index}`,
        evaluationId: evaluation.id,
        mitigation: evaluation.proposedMitigation || "—",
        severity: calculateRisk(evaluation.consequenceR1, evaluation.likelihoodR1).band || "Medium",
        derived: true
      };
    });
}

export function MitigationSection({ assessment, errors }) {
  const { session } = useAuth();
  const {
    assets,
    threats,
    evaluations,
    mitigations,
    updateMitigation,
    activeAssessmentId
  } = useWorkspace();

  const [expandedRowId, setExpandedRowId] = useState(null);

  const isAuthor = session.actingRole === ROLES.AUTHOR;
  const isReviewer = session.actingRole === ROLES.REVIEWER;
  const isApprover = session.actingRole === ROLES.APPROVER;
  const isApproved = assessment?.state === ASSESSMENT_STATES.APPROVED;
  const canEdit = isAuthor && !isApproved;
  const canComment = isReviewer && assessment?.state === ASSESSMENT_STATES.IN_REVIEW;

  const rows = useMemo(
    () => buildMitigationView(mitigations, evaluations, activeAssessmentId),
    [mitigations, evaluations, activeAssessmentId]
  );

  const totalOpen = rows.filter((m) => m.status !== "Done" && m.status !== "Cancelled").length;
  const totalDone = rows.filter((m) => m.status === "Done").length;
  const totalOverdue = rows.filter((m) => isOverdue(m.targetDate || m.target, m.status)).length;

  function findAsset(assetId) {
    return assets.find((a) => a.id === assetId);
  }

  function findThreat(threatId) {
    return threats.find((t) => t.id === threatId);
  }

  function applyPatch(row, patch) {
    if (row.derived) {
      // Materialize the derived row as a real mitigation when first edited.
      updateMitigation(row.id, { ...row, ...patch, materialized: true });
      return;
    }
    updateMitigation(row.id, patch);
  }

  return (
    <SectionShell
      number={7}
      title="Mitigation Tracking"
      description="Each proposed mitigation from Section 6 flows here as a tracked action. Status changes are logged; overdue actions notify the responsible party."
    >
      <ValidationSummary errors={errors} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total mitigations" value={rows.length} sub="Auto-derived from §6" />
        <StatCard label="Open" value={totalOpen} sub="Not yet closed" />
        <StatCard label="Completed" value={totalDone} sub="Closed actions" />
        <StatCard
          label="Overdue"
          value={totalOverdue}
          sub="Past target date"
          tone={totalOverdue > 0 ? "warn" : "default"}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-muted/60 px-4 py-2.5">
          <div className="text-[13px] font-medium text-text-secondary">Tracked actions</div>
          <div className="flex items-center gap-3">
            {canComment ? (
              <CommentAffordance section="Section 7 — Mitigation Tracking" sectionId={7} />
            ) : null}
            <div className="text-[11px] text-text-muted">
              All status changes are recorded in the audit log
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-surface-raised">
              <tr className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <th className="px-3 py-2 text-left">Mitigation</th>
                <th className="w-24 px-3 py-2 text-left">Severity</th>
                <th className="w-24 px-3 py-2 text-left">Agreed</th>
                <th className="w-44 px-3 py-2 text-left">Owner</th>
                <th className="w-36 px-3 py-2 text-left">Target</th>
                <th className="w-28 px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const asset = findAsset(row.assetId);
                const threat = findThreat(row.threatId);
                const log = row.log || [];
                const latestEntry = log[log.length - 1];
                const isExpanded = expandedRowId === row.id;
                const overdue = isOverdue(row.targetDate || row.target, row.status);
                const targetDate = row.targetDate || row.target || "";
                const ownerLabel = row.ownerLabel || row.owner || "";

                return (
                  <FragmentRow
                    key={row.id}
                    row={row}
                    asset={asset}
                    threat={threat}
                    latestEntry={latestEntry}
                    isExpanded={isExpanded}
                    overdue={overdue}
                    targetDate={targetDate}
                    ownerLabel={ownerLabel}
                    canEdit={canEdit}
                    log={log}
                    onPatch={applyPatch}
                    onToggleExpand={() => setExpandedRowId(isExpanded ? null : row.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <FooterCaption isAuthor={isAuthor} isReviewer={isReviewer} isApprover={isApprover} canEdit={canEdit} />
    </SectionShell>
  );
}

function FragmentRow({
  row,
  asset,
  threat,
  latestEntry,
  isExpanded,
  overdue,
  targetDate,
  ownerLabel,
  canEdit,
  log,
  onPatch,
  onToggleExpand
}) {
  return (
    <>
      <tr className="border-t border-border-subtle align-top hover:bg-surface-muted/40">
        <td className="px-3 py-3">
          <div className="mb-1 text-[13px] leading-snug text-text-primary">{row.mitigation}</div>
          <div className="text-[11px] text-text-muted">
            Source:{" "}
            <span className="text-text-secondary">
              {asset?.name || row.assetId} × {threat?.short || threat?.classification || row.threatId}
            </span>
          </div>
          {latestEntry ? (
            <div className="mt-2 rounded border-l-2 border-border-strong bg-surface-muted px-2 py-1.5 text-[11px]">
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-text-muted">
                <Clock size={9} aria-hidden />
                <span className="tabular-nums">{formatTs(latestEntry.timestamp || latestEntry.ts)}</span>
                <span className="text-zinc-300">·</span>
                <span>{latestEntry.userName || latestEntry.author}</span>
                <span className="text-text-disabled">— {latestEntry.roleLabel || latestEntry.authorRole}</span>
                {latestEntry.statusChange ? (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="text-text-muted">→</span>
                    <StatusPill status={latestEntry.statusChange.to} />
                  </>
                ) : null}
              </div>
              <div className="leading-snug text-text-secondary">{latestEntry.text}</div>
              {log.length > 1 ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="mt-1 text-[10px] font-medium text-text-muted hover:text-text-primary"
                >
                  {isExpanded
                    ? "▾ Hide progress log"
                    : `▸ View full progress log (${log.length} ${log.length === 1 ? "entry" : "entries"})`}
                </button>
              ) : null}
            </div>
          ) : null}
          {!latestEntry && row.status && row.status !== "Open" ? (
            <div className="mt-2 text-[11px] italic text-text-disabled">No progress notes yet.</div>
          ) : null}
        </td>
        <td className="px-3 py-3">
          <SeverityBadge severity={row.severity} />
        </td>
        <td className="px-3 py-3">
          <select
            value={row.agreed || "Pending"}
            onChange={(event) => onPatch(row, { agreed: event.target.value })}
            disabled={!canEdit}
            className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] hover:border-border-default focus:border-border-focus focus:outline-none disabled:cursor-default disabled:appearance-none"
          >
            <option>Yes</option>
            <option>No</option>
            <option>Pending</option>
          </select>
        </td>
        <td className="px-3 py-3">
          {canEdit ? (
            <select
              value={ownerLabel}
              onChange={(event) => onPatch(row, { ownerLabel: event.target.value })}
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-border-default focus:border-border-focus focus:outline-none"
            >
              {OWNER_LABELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[13px] text-text-secondary">{ownerLabel || "—"}</span>
          )}
        </td>
        <td className="px-3 py-3">
          {canEdit ? (
            <input
              type="date"
              value={targetDate}
              onChange={(event) => onPatch(row, { targetDate: event.target.value })}
              className={`rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] tabular-nums hover:border-border-default focus:border-border-focus focus:outline-none ${
                overdue ? "font-medium text-red-700" : "text-text-secondary"
              }`}
            />
          ) : (
            <div
              className={`text-[13px] tabular-nums ${overdue ? "font-medium text-red-700" : "text-text-secondary"}`}
            >
              {targetDate || "—"}
            </div>
          )}
          {overdue ? (
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-red-600">
              <AlertTriangle size={9} aria-hidden /> Overdue
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3">
          <StatusPill status={row.status || "Open"} />
        </td>
      </tr>
      {isExpanded && log.length > 1 ? (
        <tr className="border-t border-border-subtle bg-surface-muted/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="ml-4 rounded-md border border-border-default bg-surface-raised">
              <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted/50 px-3 py-2">
                <div className="text-[11px] font-medium text-text-secondary">
                  Full progress log — {asset?.name} × {threat?.short || threat?.classification}
                </div>
                <div className="text-[10px] text-text-muted">
                  {log.length} entries · append-only
                </div>
              </div>
              {[...log].reverse().map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="border-t border-border-subtle px-4 py-2.5 first:border-t-0"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-muted">
                    <Clock size={9} aria-hidden />
                    <span className="tabular-nums">{formatTs(entry.timestamp || entry.ts)}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{entry.userName || entry.author}</span>
                    <span className="text-text-disabled">— {entry.roleLabel || entry.authorRole}</span>
                    {entry.statusChange ? (
                      <span className="ml-1 inline-flex items-center gap-1">
                        <span className="text-zinc-300">·</span>
                        <span className="font-sans text-[10px] text-text-muted">Status:</span>
                        <span className="font-sans text-[10px] text-text-muted">
                          {entry.statusChange.from}
                        </span>
                        <ArrowRight size={9} className="text-text-disabled" aria-hidden />
                        <StatusPill status={entry.statusChange.to} />
                      </span>
                    ) : null}
                  </div>
                  {entry.text ? (
                    <div className="text-[12px] leading-relaxed text-text-secondary">{entry.text}</div>
                  ) : (
                    <div className="text-[11px] italic text-text-muted">
                      Status change with no progress note.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FooterCaption({ isAuthor, isReviewer, isApprover, canEdit }) {
  let copy = "";
  if (canEdit) {
    copy =
      "Author edits Agreed, Owner, and Target during the assessment cycle, recording management decisions made during the workshop. Once the assessment is approved, these fields are locked. Status and progress notes are then editable by the assigned Mitigation Owner via their My Mitigations view.";
  } else if (isAuthor) {
    copy =
      "This assessment is approved. Agreed, Owner, and Target are now locked. Status and progress notes are editable by the assigned Mitigation Owner via their My Mitigations view. Overdue mitigations automatically surface on the HQ Executive dashboard.";
  } else if (isReviewer || isApprover) {
    copy =
      "Section 7 fields are set by the Author during the assessment cycle (Agreed, Owner, Target) and updated by the Mitigation Owner post-approval (Status, progress notes). When a mitigation passes its target without being marked Done, the platform notifies the responsible party and the HQ Executive dashboard.";
  } else {
    copy =
      "Mitigation tracking is owned by the assigned Mitigation Owner once the assessment is approved.";
  }

  return (
    <div className="flex max-w-3xl items-start gap-2 text-[12px] text-text-muted">
      <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
      <span>{copy}</span>
    </div>
  );
}

function formatTs(value) {
  if (!value) return "—";
  if (typeof value !== "string") return String(value);
  if (value.length <= 16) return value;
  return value.slice(0, 16).replace("T", " ");
}
