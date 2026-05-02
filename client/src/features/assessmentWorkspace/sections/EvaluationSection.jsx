import { Banner } from "../../../components/Banner";
import { Chip, RiskChip } from "../../../components/Chip";
import { Icon } from "../../../components/icons";
import { calculateRisk } from "../../../features/assessmentWorkspace/riskMatrix";
import { SectionShell } from "./SectionShell";

function evaluationContext(evaluation, bundle) {
  const asset = bundle.assets.find((a) => a.id === evaluation.assetId);
  const threat = bundle.threats.find((t) => t.id === evaluation.threatId);
  return { asset, threat };
}

export function EvaluationSection({ bundle, readOnly }) {
  const { evaluations } = bundle;

  return (
    <SectionShell
      number={6}
      title="Vulnerability Assessment & Risk Treatment"
      description="The analytical core. R1 (pre-mitigation) and R2 (post-mitigation) ratings derive from the configurable matrix."
      actions={
        !readOnly ? (
          <button type="button" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> New evaluation
          </button>
        ) : null
      }
    >
      <Banner tone="info" title="Section 6 derives from Section 5 ticks">
        Each evaluation captures asset, threat, scenario, controls, vulnerabilities, R1, proposed mitigation,
        and R2. Library suggestions assist in filling free-text fields.
      </Banner>

      <ul className="grid gap-3">
        {evaluations.map((evaluation) => {
          const { asset, threat } = evaluationContext(evaluation, bundle);
          const r1 = calculateRisk(evaluation.consequenceScore, evaluation.likelihoodScore);
          const r2 = calculateRisk(evaluation.postConsequenceScore, evaluation.postLikelihoodScore);
          return (
            <li key={evaluation.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-vantage-navy px-2.5 py-0.5 text-xs font-semibold text-white">
                      {asset?.name}
                    </span>
                    <Chip tone="info">{threat?.classification}</Chip>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{evaluation.scenario}</p>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Consequences
                      </dt>
                      <dd className="mt-1 text-slate-700">{evaluation.consequences}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Existing controls
                      </dt>
                      <dd className="mt-1 text-slate-700">{evaluation.existingControls}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Vulnerabilities
                      </dt>
                      <dd className="mt-1 text-slate-700">{evaluation.vulnerabilities}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Proposed mitigation
                      </dt>
                      <dd className="mt-1 text-slate-700">{evaluation.mitigation}</dd>
                    </div>
                  </dl>
                </div>
                <aside className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs lg:w-48">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">R1 (pre)</p>
                    <RiskChip band={r1.band} score={r1.score} className="mt-1" />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Sev {evaluation.consequenceScore} × Likelihood {evaluation.likelihoodScore}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">R2 (post)</p>
                    <RiskChip band={r2.band} score={r2.score} className="mt-1" />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Sev {evaluation.postConsequenceScore} × Likelihood {evaluation.postLikelihoodScore}
                    </p>
                  </div>
                  {!readOnly ? (
                    <button type="button" className="btn-secondary mt-2 w-full justify-center">
                      Edit
                    </button>
                  ) : null}
                </aside>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
