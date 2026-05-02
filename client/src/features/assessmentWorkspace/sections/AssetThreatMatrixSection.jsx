import { useMemo, useState } from "react";
import { Banner } from "../../../components/Banner";
import { Chip } from "../../../components/Chip";
import { Icon } from "../../../components/icons";
import { Tabs } from "../../../components/Tabs";
import { SectionShell } from "./SectionShell";

function buildLookup(links) {
  const map = new Map();
  links.forEach((link) => {
    map.set(`${link.assetId}::${link.threatId}`, true);
  });
  return map;
}

function evaluationKeyForLink(evaluations, assetId, threatId) {
  return evaluations.find(
    (evaluation) => evaluation.assetId === assetId && evaluation.threatId === threatId
  );
}

export function AssetThreatMatrixSection({ bundle, readOnly }) {
  const { assets, threats, links, evaluations } = bundle;
  const [view, setView] = useState("grid");

  const lookup = useMemo(() => buildLookup(links), [links]);

  return (
    <SectionShell
      number={5}
      title="Asset Attractiveness Cross-Reference"
      description="Tick the cell where a threat applies to an asset. Each tick prompts a Section 6 evaluation."
      actions={
        <Tabs
          tabs={[
            { id: "grid", label: "Grid view" },
            { id: "mobile", label: "By threat" }
          ]}
          activeId={view}
          onChange={setView}
        />
      }
    >
      <Banner tone="info" title="Section 5 derives from Sections 3 and 4">
        Adding assets or threats automatically updates the matrix. Removing a source asset or threat
        cascades to the linked Section 6 evaluations with a confirmation prompt.
      </Banner>

      {view === "grid" ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 bg-white py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Asset \\ Threat
                </th>
                {threats.map((threat) => (
                  <th
                    key={threat.id}
                    className="px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    scope="col"
                  >
                    {threat.classification}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, rowIndex) => (
                <tr key={asset.id} className={rowIndex % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 py-3 pr-4 text-left text-sm font-semibold text-slate-900 ${rowIndex % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
                  >
                    {asset.name}
                  </th>
                  {threats.map((threat) => {
                    const ticked = lookup.has(`${asset.id}::${threat.id}`);
                    const evaluation = evaluationKeyForLink(evaluations, asset.id, threat.id);
                    return (
                      <td key={threat.id} className="px-2 py-3 text-center">
                        <button
                          type="button"
                          disabled={readOnly}
                          className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                            ticked
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                          }`}
                          aria-pressed={ticked}
                          aria-label={`${asset.name} × ${threat.classification}: ${ticked ? "applies" : "does not apply"}`}
                        >
                          {ticked ? <Icon name="check" className="h-4 w-4" /> : null}
                        </button>
                        {ticked ? (
                          <p className="mt-1 text-[10px] font-semibold uppercase text-slate-500">
                            {evaluation ? "Evaluated" : "Pending"}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4">
          {threats.map((threat) => {
            const matches = links.filter((link) => link.threatId === threat.id);
            return (
              <details
                key={threat.id}
                open={matches.length > 0}
                className="rounded-xl border border-slate-200 p-4 open:bg-slate-50"
              >
                <summary className="flex items-center justify-between gap-2 cursor-pointer">
                  <p className="font-semibold text-slate-900">{threat.classification}</p>
                  <Chip tone="info">{matches.length} assets</Chip>
                </summary>
                <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                  {matches.length === 0 ? (
                    <li className="rounded-lg bg-white p-3 text-slate-500">No assets linked.</li>
                  ) : (
                    matches.map((link) => {
                      const asset = assets.find((entry) => entry.id === link.assetId);
                      const evaluation = evaluationKeyForLink(evaluations, link.assetId, threat.id);
                      return (
                        <li key={link.assetId} className="rounded-lg bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span>{asset?.name}</span>
                            <Chip tone={evaluation ? "success" : "warn"}>
                              {evaluation ? "Evaluated" : "Pending evaluation"}
                            </Chip>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}
