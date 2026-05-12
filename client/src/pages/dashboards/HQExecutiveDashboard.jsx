import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { calculateRisk } from "../../features/assessmentWorkspace/riskMatrix";

const BAND_TOKENS = {
  low: {
    chip: "bg-severity-low-bg text-severity-low-text border-severity-low-fill",
    fill: "bg-severity-low-fill",
    label: "Low"
  },
  medium: {
    chip: "bg-severity-medium-bg text-severity-medium-text border-severity-medium-fill",
    fill: "bg-severity-medium-fill",
    label: "Medium"
  },
  high: {
    chip: "bg-severity-high-bg text-severity-high-text border-severity-high-fill",
    fill: "bg-severity-high-fill",
    label: "High"
  },
  "very-high": {
    chip: "bg-severity-very-high-bg text-severity-very-high-text border-severity-very-high-fill",
    fill: "bg-severity-very-high-fill",
    label: "V.High"
  }
};

function HeatLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
      {["low", "medium", "high", "very-high"].map((band) => {
        const tokens = BAND_TOKENS[band];
        return (
          <div key={band} className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded-sm ${tokens.fill}`} />
            <span>{tokens.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function KPI({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-text-primary",
    warn: "text-amber-700",
    accent: "text-primary"
  };
  return (
    <div className="rounded-lg border border-border-default bg-surface-raised px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function bandFromScore(score) {
  if (!score) return null;
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 15) return "high";
  return "very-high";
}

export function HQExecutiveDashboard() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const evaluations = workspace.evaluations;
  const threats = workspace.threats;

  const thisFacility = useMemo(() => {
    const open = evaluations.length;
    const high = evaluations.filter((e) => {
      const r = calculateRisk(e.consequenceR1, e.likelihoodR1);
      return r && r.band === "High";
    }).length;
    const vhigh = evaluations.filter((e) => {
      const r = calculateRisk(e.consequenceR1, e.likelihoodR1);
      return r && r.band === "Very High";
    }).length;
    return {
      facilityId: "fac-1",
      name: "Lagos Refinery",
      open,
      high,
      vhigh,
      overdue: 3,
      status: "Draft"
    };
  }, [evaluations]);

  const allFacilities = [thisFacility, ...workspace.hqAggregate];
  const totalOpen = allFacilities.reduce((s, f) => s + f.open, 0);
  const totalHigh = allFacilities.reduce((s, f) => s + f.high + f.vhigh, 0);
  const totalOverdue = allFacilities.reduce((s, f) => s + f.overdue, 0);

  const heatmapData = useMemo(() => {
    return allFacilities.map((facility, fi) => ({
      facilityId: facility.facilityId,
      facility: facility.name,
      cells: threats.map((threat, ti) => {
        if (facility.facilityId === "fac-1") {
          const evals = evaluations.filter((e) => e.threatId === threat.id);
          if (!evals.length) return { score: 0, count: 0 };
          const top = Math.max(
            ...evals.map((e) => calculateRisk(e.consequenceR1, e.likelihoodR1)?.score || 0)
          );
          return { score: top, count: evals.length };
        }
        const seed = (fi * 13 + ti * 7) % 25;
        return { score: seed, count: Math.max(1, seed % 4) };
      })
    }));
  }, [allFacilities, evaluations, threats]);

  const flags = [
    {
      id: "f1",
      title: "Maritime threat under-rated",
      detail: "Fujairah Marine Terminal rated Maritime as Low; 4 of 5 peer facilities rated Medium or High.",
      facility: "Fujairah Marine Terminal"
    },
    {
      id: "f2",
      title: "Cyber consequence outlier",
      detail: "Pernis Refinery Complex rated Cyber consequence at level 5; peer median is 3.",
      facility: "Pernis Refinery Complex"
    },
    {
      id: "f3",
      title: "Insider threat divergence",
      detail: "Jurong Storage Terminal rated Insider as Very Low; 4 of 5 peers rated Medium.",
      facility: "Jurong Storage Terminal"
    }
  ];

  /* Look up the first assessment for any facility (preferring active
     cycles over historical) so the heatmap and Facilities table can
     drill into every facility, not just the demo's primary one. */
  const assessmentByFacility = useMemo(() => {
    const map = new Map();
    Object.values(workspace.assessmentsById).forEach((assessment) => {
      const existing = map.get(assessment.facilityId);
      if (!existing) {
        map.set(assessment.facilityId, assessment);
        return;
      }
      const existingYear = parseInt(existing.cycle, 10) || 0;
      const candidateYear = parseInt(assessment.cycle, 10) || 0;
      if (candidateYear > existingYear) {
        map.set(assessment.facilityId, assessment);
      }
    });
    return map;
  }, [workspace.assessmentsById]);

  const drillIntoFacility = useCallback(
    (facilityId) => {
      const assessment = assessmentByFacility.get(facilityId);
      if (!assessment) return;
      navigate(`/assessments/${assessment.id}/sections/6`);
    },
    [assessmentByFacility, navigate]
  );

  const hasAssessment = useCallback(
    (facilityId) => assessmentByFacility.has(facilityId),
    [assessmentByFacility]
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Enterprise risk overview
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Cross-facility view across {allFacilities.length} sites · last refreshed just now
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
            Last 30 days
          </span>
          <button
            type="button"
            onClick={() => alert("Export prepared — would download enterprise risk PDF report.")}
            className="btn-secondary text-[12px]"
          >
            Export
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="Open evaluations" value={totalOpen} sub={`${allFacilities.length} facilities`} />
        <KPI
          label="High / Very High risks"
          value={totalHigh}
          sub="Across all sites"
          tone="warn"
        />
        <KPI
          label="Overdue mitigations"
          value={totalOverdue}
          sub="Action required"
          tone={totalOverdue > 0 ? "warn" : "default"}
        />
        <KPI label="Inconsistency flags" value="3" sub="Detected by AI" tone="accent" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised lg:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-text-primary">Risk heatmap</p>
              <p className="text-[11px] text-text-muted">Facility × threat. Cell colour = highest R1 in scope.</p>
            </div>
            <HeatLegend />
          </header>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Facility
                  </th>
                  {threats.map((threat) => (
                    <th
                      key={threat.id}
                      className="px-1 py-2 text-center text-[9px] font-medium text-text-muted"
                    >
                      {threat.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row) => {
                  const drillable = hasAssessment(row.facilityId);
                  return (
                  <tr key={row.facilityId} className="border-t border-border-subtle">
                    <td className="px-3 py-2 text-[13px] font-medium">
                      <button
                        type="button"
                        onClick={drillable ? () => drillIntoFacility(row.facilityId) : undefined}
                        disabled={!drillable}
                        className={
                          drillable
                            ? "text-primary hover:underline"
                            : "text-text-disabled cursor-default"
                        }
                      >
                        {row.facility}
                      </button>
                    </td>
                    {row.cells.map((cell, idx) => {
                      const band = bandFromScore(cell.score);
                      const tokens = band ? BAND_TOKENS[band] : null;
                      return (
                        <td key={idx} className="px-1 py-1 text-center align-middle">
                          {band ? (
                            <div
                              className={`mx-auto flex aspect-[2/1] min-w-[40px] items-center justify-center rounded border text-[10px] font-semibold ${tokens.chip}`}
                              title={`${row.facility} · ${threats[idx].name} · top R1 = ${cell.score}`}
                            >
                              {cell.score}
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-300">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
          <header className="border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary-50 dark:bg-primary-900/40">
                <Sparkles size={11} className="text-primary" />
              </div>
              <p className="text-[13px] font-semibold text-text-primary">Cross-facility AI flags</p>
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted">Statistical outliers in ratings</p>
          </header>
          <div className="divide-y divide-border-subtle">
            {flags.map((flag) => {
              const flagFacility = allFacilities.find((f) => f.name === flag.facility);
              const flagFacilityId = flagFacility?.facilityId;
              const drillable = flagFacilityId ? hasAssessment(flagFacilityId) : false;
              return (
                <div key={flag.id} className="px-4 py-2.5 hover:bg-surface-muted/40">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-[12px] font-medium text-text-primary">{flag.title}</div>
                      <div className="text-[11px] leading-snug text-text-muted">{flag.detail}</div>
                      {drillable ? (
                        <button
                          type="button"
                          onClick={() => drillIntoFacility(flagFacilityId)}
                          className="mt-1 text-[11px] font-medium text-primary hover:text-primary-600"
                        >
                          Review →
                        </button>
                      ) : (
                        <span className="mt-1 inline-block text-[11px] text-text-disabled">
                          No active assessment
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border-default bg-surface-raised">
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <span className="text-[13px] font-semibold text-text-primary">Facilities</span>
          <span className="text-[11px] text-text-muted">Click a facility to drill in</span>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              <th className="px-4 py-2 text-left">Facility</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Open</th>
              <th className="px-4 py-2 text-right">High</th>
              <th className="px-4 py-2 text-right">Very High</th>
              <th className="px-4 py-2 text-right">Overdue</th>
              <th className="w-40 px-4 py-2 text-left">Risk distribution</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {allFacilities.map((facility) => {
              const total = facility.open || 1;
              const drillable = hasAssessment(facility.facilityId);
              return (
                <tr key={facility.facilityId} className="border-t border-border-subtle hover:bg-surface-muted/40">
                  <td className="px-4 py-2.5 font-medium">{facility.name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        facility.status === "Approved"
                          ? "bg-emerald-50 text-emerald-800"
                          : facility.status === "In Review"
                            ? "bg-blue-50 text-blue-800"
                            : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {facility.status === "Approved" ? <Lock size={9} aria-hidden /> : null}
                      {facility.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{facility.open}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-orange-700">{facility.high}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{facility.vhigh}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{facility.overdue}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className={BAND_TOKENS["very-high"].fill}
                        style={{ width: `${(facility.vhigh / total) * 100}%` }}
                      />
                      <div
                        className={BAND_TOKENS.high.fill}
                        style={{ width: `${(facility.high / total) * 100}%` }}
                      />
                      <div
                        className={`${BAND_TOKENS.medium.fill} opacity-50`}
                        style={{
                          width: `${((facility.open - facility.high - facility.vhigh) / total) * 100}%`
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={drillable ? () => drillIntoFacility(facility.facilityId) : undefined}
                      disabled={!drillable}
                      className={`text-[12px] ${
                        drillable
                          ? "font-medium text-primary hover:underline"
                          : "text-text-disabled cursor-default"
                      }`}
                    >
                      {drillable ? "Open →" : "No assessment"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
