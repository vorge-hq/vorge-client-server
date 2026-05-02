import { Banner } from "../../../components/Banner";
import { RiskChip } from "../../../components/Chip";
import { Icon } from "../../../components/icons";
import { SectionShell } from "./SectionShell";

export function AssetDisaggregationSection({ bundle, readOnly }) {
  const { assets } = bundle;

  return (
    <SectionShell
      number={3}
      title="Asset Disaggregation"
      description="Master list of facility components. Section 5 (matrix) and Section 6 (evaluations) derive from this."
      actions={
        !readOnly ? (
          <button type="button" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> Add asset
          </button>
        ) : null
      }
    >
      <Banner tone="info" title="This section is the source of truth for assets">
        Adding or removing assets here automatically appears in Sections 5 and 6. Library suggestions are
        available when filling Description, Consequences, and Dependencies fields.
      </Banner>

      <ul className="grid gap-3">
        {assets.map((asset) => (
          <li key={asset.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{asset.name}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                    {asset.type}
                  </span>
                  <RiskChip band={asset.criticality} />
                </div>
                <p className="mt-2 text-sm text-slate-700">{asset.description}</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dependencies
                    </dt>
                    <dd className="mt-1 text-slate-700">{asset.dependencies.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Consequences
                    </dt>
                    <dd className="mt-1 text-slate-700">{asset.consequences}</dd>
                  </div>
                </dl>
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="btn-secondary">Edit</button>
                  <button type="button" className="btn-secondary">Remove</button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
