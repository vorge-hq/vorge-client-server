import { useState } from "react";
import { FileText, Lock, Plus, Trash2, Upload, Users } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { Tabs } from "../../../components/Tabs";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import {
  CONSEQUENCE_AXES,
  CONSEQUENCE_LABELS,
  LIKELIHOOD_LABELS,
  RISK_BANDS
} from "../riskMatrix";
import { ASSESSMENT_STATES, getCommentPermission } from "../assessmentModel";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const TABS = [
  { id: "team", label: "SRA team members" },
  { id: "references", label: "References" },
  { id: "matrix", label: "Risk matrix" }
];

const SEED_TEAM = [
  { id: "tm1", type: "Internal", name: "Daniel Mensah", position: "Facility Manager", expertise: "Operations", company: "Operator A" },
  { id: "tm2", type: "Internal", name: "Liam O'Connor", position: "OT Cyber Lead", expertise: "Cyber", company: "Operator A" },
  { id: "tm3", type: "External", name: "Yusuf Bello", position: "Marine Coordinator", expertise: "Maritime", company: "Coastal Marine Services" }
];

const SEED_REFS = [
  { id: "r1", description: "Site security plan (2024)", type: "PDF" },
  { id: "r2", description: "Eko Petrochemical Hub perimeter as-built drawings", type: "DWG" },
  { id: "r3", description: "Last SRA exported document", type: "DOCX" }
];

function ApprovalsTable({ assessment }) {
  const rows = [
    {
      role: "Author",
      name: assessment?.leadAuthorUserId === "user-demo-author" ? "Adaeze Okeke" : "Author",
      timestamp: assessment?.signatureDates?.author || "—",
      status: assessment?.signatureDates?.author ? "Signed" : "Pending"
    },
    {
      role: "Reviewer",
      name: "Mei-Lin Tanaka",
      timestamp: assessment?.signatureDates?.reviewer || "—",
      status: assessment?.signatureDates?.reviewer ? "Signed" : "Pending"
    },
    {
      role: "Approver",
      name: "Rafael Castellanos",
      timestamp: assessment?.signatureDates?.approver || "—",
      status: assessment?.signatureDates?.approver ? "Signed" : "Pending"
    }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border-default">
      <table className="min-w-full text-left text-[12px]">
        <thead className="bg-surface-muted/60 text-[10px] uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Signature timestamp</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle bg-surface-raised">
          {rows.map((row) => (
            <tr key={row.role}>
              <td className="px-3 py-2 font-medium text-text-primary">{row.role}</td>
              <td className="px-3 py-2 text-text-secondary">{row.name}</td>
              <td className="px-3 py-2 tabular-nums text-text-secondary">{row.timestamp}</td>
              <td className="px-3 py-2">
                <Chip tone={row.status === "Signed" ? "success" : "warn"}>{row.status}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributorsCard({ readOnly }) {
  const [team, setTeam] = useState(SEED_TEAM);

  function addRow() {
    const id = `tm-${team.length + 1}-${Date.now()}`;
    setTeam([
      ...team,
      { id, type: "Internal", name: "", position: "", expertise: "", company: "" }
    ]);
  }

  function update(id, field, value) {
    setTeam(team.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function remove(id) {
    setTeam(team.filter((row) => row.id !== id));
  }

  return (
    <div className="rounded-lg border border-border-default">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <Users size={13} className="text-text-secondary" />
          <span className="text-[12px] font-semibold">Contributors</span>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={addRow} className="btn-primary inline-flex items-center gap-1.5 text-[11px]">
            <Plus size={11} aria-hidden /> Add contributor
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead className="bg-surface-muted/60 text-[10px] uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Expertise</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2" aria-label="actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-raised">
            {team.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-1.5">
                  <select
                    value={row.type}
                    onChange={(event) => update(row.id, "type", event.target.value)}
                    disabled={readOnly}
                    className="field-control text-[12px]"
                  >
                    <option>Internal</option>
                    <option>External</option>
                    <option>Specialist</option>
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={row.name}
                    onChange={(event) => update(row.id, "name", event.target.value)}
                    disabled={readOnly}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={row.position}
                    onChange={(event) => update(row.id, "position", event.target.value)}
                    disabled={readOnly}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={row.expertise}
                    onChange={(event) => update(row.id, "expertise", event.target.value)}
                    disabled={readOnly}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={row.company}
                    onChange={(event) => update(row.id, "company", event.target.value)}
                    disabled={readOnly}
                    className="field-control text-[12px]"
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="rounded p-1 text-text-disabled hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${row.name || "contributor"}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferencesTable({ readOnly }) {
  const [refs, setRefs] = useState(SEED_REFS);

  function addRow() {
    setRefs([...refs, { id: `r-${refs.length + 1}-${Date.now()}`, description: "", type: "PDF" }]);
  }

  function update(id, field, value) {
    setRefs(refs.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function remove(id) {
    setRefs(refs.filter((row) => row.id !== id));
  }

  return (
    <div className="rounded-lg border border-border-default">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <FileText size={13} className="text-text-secondary" />
          <span className="text-[12px] font-semibold">References</span>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={addRow} className="btn-primary inline-flex items-center gap-1.5 text-[11px]">
            <Upload size={11} aria-hidden /> Add reference
          </button>
        )}
      </header>
      <ul className="divide-y divide-border-subtle">
        {refs.map((row) => (
          <li key={row.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <input
              value={row.description}
              onChange={(event) => update(row.id, "description", event.target.value)}
              disabled={readOnly}
              className="field-control text-[12px]"
            />
            <select
              value={row.type}
              onChange={(event) => update(row.id, "type", event.target.value)}
              disabled={readOnly}
              className="field-control text-[12px] sm:w-32"
            >
              <option>PDF</option>
              <option>DOCX</option>
              <option>DWG</option>
              <option>URL</option>
              <option>Image</option>
            </select>
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => remove(row.id)}
                className="rounded p-1 text-text-disabled hover:bg-red-50 hover:text-red-700"
                aria-label="Remove reference"
              >
                <Trash2 size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskMatrixView({ frozen }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-raised p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-text-primary">Risk matrix · 5 × 5</p>
        {frozen ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
            <Lock size={9} aria-hidden /> Frozen with this version
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="overflow-x-auto">
          <div className="mb-1 ml-[88px] text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Likelihood &rarr;
          </div>
          <div className="flex items-stretch">
            <div className="flex w-4 items-center justify-center pr-2">
              <div className="rotate-[270deg] whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Consequence &rarr;
              </div>
            </div>

            <table className="text-[12px]">
              <thead>
                <tr>
                  <th className="w-[80px]" aria-hidden />
                  {[1, 2, 3, 4, 5].map((l) => (
                    <th key={l} className="px-2 py-2 align-bottom">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">L{l}</div>
                      <div className="mt-0.5 text-[12px] font-medium text-text-primary">
                        {LIKELIHOOD_LABELS[l - 1]}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[5, 4, 3, 2, 1].map((c) => (
                  <tr key={c}>
                    <th className="pr-3 align-middle text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">C{c}</div>
                      <div className="text-[12px] font-medium text-text-primary">
                        {CONSEQUENCE_LABELS[c]}
                      </div>
                    </th>
                    {[1, 2, 3, 4, 5].map((l) => {
                      const score = c * l;
                      const band = score <= 4 ? "low" : score <= 9 ? "med" : score <= 15 ? "high" : "vhigh";
                      const colors = {
                        low: "bg-emerald-50 text-emerald-800",
                        med: "bg-amber-50 text-amber-900",
                        high: "bg-orange-50 text-orange-800",
                        vhigh: "bg-red-50 text-red-800"
                      };
                      return (
                        <td
                          key={l}
                          className={`h-[50px] w-[64px] text-center text-[13px] font-semibold ${colors[band]}`}
                        >
                          {score}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-text-secondary lg:max-w-xs">
          <div>
            <p className="text-[12px] font-semibold text-text-primary">Risk bands</p>
            <ul className="mt-2 space-y-1">
              {Object.values(RISK_BANDS).map((band) => (
                <li key={band.id} className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded ${band.fill}`} />
                  <span>
                    {band.id} ({band.min}&ndash;{band.max})
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="my-4 border-t border-border-default" />
          <div>
            <p className="text-[12px] font-semibold text-text-primary">Consequence axes</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {CONSEQUENCE_AXES.map((axis) => (
                <li key={axis}>{axis}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppendicesSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const [tab, setTab] = useState("team");
  const isApproved = assessment?.state === ASSESSMENT_STATES.APPROVED;
  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  return (
    <SectionShell
      number={9}
      title="Appendices"
      description="Document approvals, contributors, references, and the frozen risk matrix snapshot."
      actions={
        commentKind ? (
          <CommentAffordance
            section="Section 9 — Appendices"
            sectionId={9}
            kind={commentKind}
          />
        ) : null
      }
    >
      <ValidationSummary errors={errors} />
      <Tabs
        tabs={TABS}
        activeId={tab}
        onChange={setTab}
      />

      {tab === "team" ? (
        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Document approvals
            </p>
            <ApprovalsTable assessment={assessment} />
          </div>
          <ContributorsCard readOnly={readOnly} />
        </div>
      ) : null}

      {tab === "references" ? <ReferencesTable readOnly={readOnly} /> : null}

      {tab === "matrix" ? <RiskMatrixView frozen={isApproved} /> : null}
    </SectionShell>
  );
}
