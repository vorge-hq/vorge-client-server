import { useState } from "react";
import { Banner } from "../../../components/Banner";
import { Chip } from "../../../components/Chip";
import { Tabs } from "../../../components/Tabs";
import { Icon } from "../../../components/icons";
import { CONSEQUENCE_AXES, CONSEQUENCE_LABELS, LIKELIHOOD_LABELS, RISK_BANDS, getBandClasses, getBandForScore } from "../riskMatrix";
import { SectionShell } from "./SectionShell";

const TABS = [
  { id: "team", label: "Team Members" },
  { id: "references", label: "References" },
  { id: "matrix", label: "Risk Matrix" }
];

function TeamMembersPanel({ assessment, readOnly }) {
  return (
    <div className="grid gap-4">
      <Banner tone="info" title="Document Approvals">
        Lead Author, Reviewer, and Approver are populated from facility defaults. Lead Author reassignment
        runs through a controlled modal (not inline).
      </Banner>

      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          { role: "Lead Author", name: "Omar Haddad", status: "Signed at submission" },
          { role: "Reviewer", name: "Sarah Okonkwo", status: "Review complete" },
          { role: "Approver", name: "Marcus King", status: "Pending decision" }
        ].map((row) => (
          <li key={row.role} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.role}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{row.name}</p>
            <p className="mt-1 text-xs text-slate-600">{row.status}</p>
          </li>
        ))}
      </ul>

      <div className="surface-card p-4">
        <header className="flex items-center justify-between">
          <p className="font-semibold text-slate-900">Contributors</p>
          {!readOnly ? (
            <button type="button" className="btn-secondary">
              <Icon name="plus" className="h-4 w-4" /> Add contributor
            </button>
          ) : null}
        </header>
        <p className="mt-1 text-xs text-slate-500">
          Contributors are not platform users. The directory autocompletes from prior assessments.
        </p>
        <ul className="mt-4 grid gap-2">
          {assessment.contributors.map((contributor) => (
            <li
              key={contributor.id}
              className="grid gap-1 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {contributor.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">{contributor.position}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {contributor.expertise} · {contributor.company}
                </p>
              </div>
              <Chip>{contributor.type}</Chip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReferencesPanel({ assessment, readOnly }) {
  return (
    <div className="grid gap-3">
      <Banner tone="info" title="Attach files or links">
        Supports facility schematics, site plans, prior SRA exports, photos. v1 storage limit guidance is
        50 MB per file.
      </Banner>
      {!readOnly ? (
        <button type="button" className="btn-secondary self-start">
          <Icon name="plus" className="h-4 w-4" /> Add reference
        </button>
      ) : null}
      <ul className="grid gap-2">
        {assessment.references.length === 0 ? (
          <li className="surface-card p-4 text-sm text-slate-500">
            No references attached yet.
          </li>
        ) : (
          assessment.references.map((reference) => (
            <li
              key={reference.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{reference.description}</p>
                <p className="text-xs text-slate-500">{reference.type}</p>
              </div>
              <button type="button" className="btn-secondary">Open</button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function RiskMatrixPanel() {
  return (
    <div className="grid gap-3">
      <Banner tone="info" title="Frozen on approval">
        The matrix shown is the current configuration. Approved assessments freeze a snapshot at approval.
      </Banner>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 p-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Consequence \ Likelihood
              </th>
              {LIKELIHOOD_LABELS.map((label, index) => (
                <th
                  key={label}
                  className="border-b border-slate-200 p-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {index + 1}. {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSEQUENCE_LABELS.map((label, severity) => (
              <tr key={label}>
                <th
                  scope="row"
                  className="border-b border-slate-200 p-2 text-left text-xs font-semibold text-slate-700"
                >
                  {severity}. {label}
                  <p className="text-[11px] font-normal text-slate-500">{CONSEQUENCE_AXES.join(" · ")}</p>
                </th>
                {LIKELIHOOD_LABELS.map((__, likelihood) => {
                  const score = severity * (likelihood + 1);
                  const band = getBandForScore(score);
                  return (
                    <td key={likelihood} className="border-b border-slate-200 p-2 text-center">
                      <span
                        className={`inline-flex h-12 w-full items-center justify-center rounded-lg text-xs font-semibold ${band ? getBandClasses(band.id) : "bg-slate-100 text-slate-500"}`}
                      >
                        {severity === 0 ? "—" : score}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 sm:grid-cols-4">
        {Object.values(RISK_BANDS).map((band) => (
          <li
            key={band.id}
            className={`rounded-xl border border-transparent p-3 text-xs font-semibold ${band.fg} ${band.bg}`}
          >
            <p>{band.id}</p>
            <p className="mt-1 text-[11px] font-normal">
              Score {band.min} – {band.max}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppendicesSection({ assessment, readOnly }) {
  const [tab, setTab] = useState("team");

  return (
    <SectionShell
      number={9}
      title="Appendices"
      description="SRA Team Members, References, and the Risk Matrix snapshot."
      actions={<Tabs tabs={TABS} activeId={tab} onChange={setTab} />}
    >
      {tab === "team" ? <TeamMembersPanel assessment={assessment} readOnly={readOnly} /> : null}
      {tab === "references" ? <ReferencesPanel assessment={assessment} readOnly={readOnly} /> : null}
      {tab === "matrix" ? <RiskMatrixPanel /> : null}
    </SectionShell>
  );
}
