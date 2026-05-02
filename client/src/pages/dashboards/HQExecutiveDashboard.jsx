import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Card, CardHeader } from "../../components/Card";
import { RiskChip, StateChip } from "../../components/Chip";
import { KpiCard } from "../../components/KpiCard";
import { PageHeader } from "../../components/PageHeader";
import { ASSESSMENTS } from "../../data/assessments";
import { FACILITIES } from "../../data/operators";
import { MITIGATIONS } from "../../data/mitigations";

export function HQExecutiveDashboard() {
  const { session } = useAuth();
  const portfolioFacilities = FACILITIES.filter((facility) =>
    session.facilities.some((accessible) => accessible.id === facility.id)
  );
  const overdue = MITIGATIONS.filter(
    (m) => m.status !== "Done" && new Date(m.targetDate) < new Date()
  );

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="HQ Executive · Portfolio"
        title="Portfolio risk overview"
        description="Cross-facility heatmap, overdue mitigations, recent approvals, and consistency flags."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Facilities" value={portfolioFacilities.length} hint="Within your scope" />
        <KpiCard label="Very High residual" value={1} tone="danger" hint="Requires Approver attention" />
        <KpiCard label="High residual" value={3} tone="warn" />
        <KpiCard label="Overdue mitigations" value={overdue.length} tone={overdue.length ? "warn" : "default"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Heatmap"
            title="Residual risk by facility"
            description="Counts of evaluations rated by post-mitigation band (R2)."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Facility</th>
                  <th className="py-2 pr-4">Low</th>
                  <th className="py-2 pr-4">Medium</th>
                  <th className="py-2 pr-4">High</th>
                  <th className="py-2 pr-4">Very High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {portfolioFacilities.map((facility, index) => {
                  const sample = [
                    [3, 4, 1, 0],
                    [2, 3, 2, 1],
                    [4, 5, 0, 0]
                  ][index % 3];
                  return (
                    <tr key={facility.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900">{facility.name}</td>
                      {sample.map((value, valueIndex) => (
                        <td key={valueIndex} className="py-3 pr-4">
                          <RiskChip
                            band={["Low", "Medium", "High", "Very High"][valueIndex]}
                            score={value}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader
            eyebrow="Recent activity"
            title="Recent approvals"
            description="Approved versions across your portfolio."
          />
          <ul className="mt-4 grid gap-3">
            {ASSESSMENTS.filter((a) => a.state === "Approved").map((assessment) => (
              <li
                key={assessment.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="font-semibold text-slate-900">{assessment.name}</p>
                  <p className="text-xs text-slate-500">
                    Approved {assessment.approvedAt ? new Date(assessment.approvedAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StateChip state={assessment.state} />
                  <Link to={`/assessments/${assessment.id}/sections/1`} className="btn-secondary">
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </section>
  );
}
