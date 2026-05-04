import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, Sparkles } from "lucide-react";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { calculateRisk } from "../../features/assessmentWorkspace/riskMatrix";
import { HQ_AGGREGATE, ACTIVE_ASSESSMENT_ID } from "../../data/assessments";

const RISK_BAND_STYLES = {
  low: { bg: "#ecfdf5", text: "#065f46", dot: "#10b981", border: "#a7f3d0" },
  med: { bg: "#fefce8", text: "#854d0e", dot: "#eab308", border: "#fde68a" },
  high: { bg: "#fff7ed", text: "#9a3412", dot: "#f97316", border: "#fed7aa" },
  vhigh: { bg: "#fef2f2", text: "#991b1b", dot: "#dc2626", border: "#fecaca" }
};

function HeatLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
      {["low", "med", "high", "vhigh"].map((band) => {
        const style = RISK_BAND_STYLES[band];
        return (
          <div key={band} className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: style.dot }} />
            <span className="capitalize">{band === "vhigh" ? "V.High" : band}</span>
          </div>
        );
      })}
    </div>
  );
}

function KPI({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-zinc-900",
    warn: "text-amber-700",
    accent: "text-[#1E3A5F]"
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>
    </div>
  );
}

function bandFromScore(score) {
  if (!score) return null;
  if (score <= 4) return "low";
  if (score <= 9) return "med";
  if (score <= 15) return "high";
  return "vhigh";
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
      name: "Asset Site 1",
      open,
      high,
      vhigh,
      overdue: 3,
      status: "Draft"
    };
  }, [evaluations]);

  const allFacilities = [thisFacility, ...HQ_AGGREGATE];
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
      detail: "Asset Site 3 rated Maritime as Low; 4 of 5 peer facilities rated Medium or High.",
      facility: "Asset Site 3"
    },
    {
      id: "f2",
      title: "Cyber consequence outlier",
      detail: "Asset Site 4 rated Cyber consequence at level 5; peer median is 3.",
      facility: "Asset Site 4"
    },
    {
      id: "f3",
      title: "Insider threat divergence",
      detail: "Asset Site 5 rated Insider as Very Low; 4 of 5 peers rated Medium.",
      facility: "Asset Site 5"
    }
  ];

  function drillIntoActive() {
    navigate(`/assessments/${ACTIVE_ASSESSMENT_ID}/sections/6`);
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Enterprise risk overview
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
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
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white lg:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900">Risk heatmap</p>
              <p className="text-[11px] text-zinc-500">Facility × threat. Cell colour = highest R1 in scope.</p>
            </div>
            <HeatLegend />
          </header>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Facility
                  </th>
                  {threats.map((threat) => (
                    <th
                      key={threat.id}
                      className="px-1 py-2 text-center text-[9px] font-medium text-zinc-500"
                    >
                      {threat.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row) => (
                  <tr key={row.facilityId} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-[13px] font-medium">
                      <button
                        type="button"
                        onClick={row.facilityId === "fac-1" ? drillIntoActive : undefined}
                        className={
                          row.facilityId === "fac-1"
                            ? "text-[#1E3A5F] hover:underline"
                            : "text-zinc-900"
                        }
                      >
                        {row.facility}
                      </button>
                    </td>
                    {row.cells.map((cell, idx) => {
                      const band = bandFromScore(cell.score);
                      const style = band ? RISK_BAND_STYLES[band] : null;
                      return (
                        <td key={idx} className="px-1 py-1 text-center align-middle">
                          {band ? (
                            <div
                              className="mx-auto flex aspect-[2/1] items-center justify-center rounded text-[10px] font-semibold"
                              style={{
                                background: style.bg,
                                color: style.text,
                                border: `1px solid ${style.border}`,
                                minWidth: "40px"
                              }}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-[#EFF4FB]">
                <Sparkles size={11} className="text-[#1E3A5F]" />
              </div>
              <p className="text-[13px] font-semibold text-zinc-900">Cross-facility AI flags</p>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">Statistical outliers in ratings</p>
          </header>
          <div className="divide-y divide-zinc-100">
            {flags.map((flag) => (
              <div key={flag.id} className="px-4 py-2.5 hover:bg-zinc-50/40">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 text-[12px] font-medium text-zinc-900">{flag.title}</div>
                    <div className="text-[11px] leading-snug text-zinc-500">{flag.detail}</div>
                    <button
                      type="button"
                      onClick={drillIntoActive}
                      className="mt-1 text-[11px] font-medium text-[#1E3A5F] hover:text-[#16294A]"
                    >
                      Review →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <span className="text-[13px] font-semibold text-zinc-900">Facilities</span>
          <span className="text-[11px] text-zinc-500">Click a facility to drill in</span>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/60">
            <tr className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
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
              const isLagos = facility.facilityId === "fac-1";
              return (
                <tr key={facility.facilityId} className="border-t border-zinc-100 hover:bg-zinc-50/40">
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
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        style={{
                          width: `${(facility.vhigh / total) * 100}%`,
                          background: RISK_BAND_STYLES.vhigh.dot
                        }}
                      />
                      <div
                        style={{
                          width: `${(facility.high / total) * 100}%`,
                          background: RISK_BAND_STYLES.high.dot
                        }}
                      />
                      <div
                        style={{
                          width: `${((facility.open - facility.high - facility.vhigh) / total) * 100}%`,
                          background: RISK_BAND_STYLES.med.dot,
                          opacity: 0.5
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={isLagos ? drillIntoActive : undefined}
                      className={`text-[12px] ${
                        isLagos
                          ? "font-medium text-[#1E3A5F] hover:underline"
                          : "text-zinc-400"
                      }`}
                    >
                      {isLagos ? "Open →" : "View"}
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
