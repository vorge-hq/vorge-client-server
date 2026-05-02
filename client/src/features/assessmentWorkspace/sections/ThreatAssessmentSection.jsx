import { Banner } from "../../../components/Banner";
import { RiskChip } from "../../../components/Chip";
import { Icon } from "../../../components/icons";
import { SectionShell } from "./SectionShell";

export function ThreatAssessmentSection({ bundle, readOnly }) {
  const { threats } = bundle;

  return (
    <SectionShell
      number={4}
      title="Threat Assessment"
      description="Threat classifications scoped per facility. Default 8 categories ship as starting configuration."
      actions={
        !readOnly ? (
          <button type="button" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> Add threat
          </button>
        ) : null
      }
    >
      <Banner tone="info" title="Configurable list">
        Admin can add, edit, or remove threat categories per facility. Changes flow into Section 5
        automatically.
      </Banner>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Threat</th>
              <th className="py-2 pr-4">General history</th>
              <th className="py-2 pr-4">Facility history</th>
              <th className="py-2 pr-4">Capability & intent</th>
              <th className="py-2 pr-4">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {threats.map((threat) => (
              <tr key={threat.id} className="align-top">
                <td className="py-3 pr-4 font-semibold text-slate-900">{threat.classification}</td>
                <td className="py-3 pr-4 text-slate-700">{threat.history}</td>
                <td className="py-3 pr-4 text-slate-700">{threat.facilityHistory}</td>
                <td className="py-3 pr-4 text-slate-700">{threat.capabilityIntent}</td>
                <td className="py-3 pr-4">
                  <RiskChip band={threat.rating} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {threats.map((threat) => (
          <li key={threat.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{threat.classification}</p>
              <RiskChip band={threat.rating} />
            </div>
            <p className="mt-2 text-sm text-slate-700">{threat.history}</p>
            <dl className="mt-3 grid gap-2 text-sm text-slate-700">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Facility history
                </dt>
                <dd>{threat.facilityHistory}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Capability & intent
                </dt>
                <dd>{threat.capabilityIntent}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
