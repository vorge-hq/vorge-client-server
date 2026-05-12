import { useState } from "react";
import { FileText, Lock, Plus, Trash2, Upload, Users } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { Tabs } from "../../../components/Tabs";
import { Chip } from "../../../components/Chip";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { CONSEQUENCE_AXES, RISK_BANDS } from "../riskMatrix";
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
  { id: "r2", description: "Lagos Refinery perimeter as-built drawings", type: "DWG" },
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
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <table className="min-w-full text-left text-[12px]">
        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Person</th>
            <th className="px-3 py-2">Signature timestamp</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.role}>
              <td className="px-3 py-2 font-medium text-zinc-900">{row.role}</td>
              <td className="px-3 py-2 text-zinc-700">{row.name}</td>
              <td className="px-3 py-2 tabular-nums text-zinc-600">{row.timestamp}</td>
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
    <div className="rounded-lg border border-zinc-200">
      <header className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <Users size={13} className="text-zinc-700" />
          <span className="text-[12px] font-semibold">Contributors</span>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={addRow} className="btn-secondary text-[11px]">
            <Plus size={11} aria-hidden /> Add contributor
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Expertise</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2" aria-label="actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
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
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-700"
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
    <div className="rounded-lg border border-zinc-200">
      <header className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <div className="inline-flex items-center gap-2">
          <FileText size={13} className="text-zinc-700" />
          <span className="text-[12px] font-semibold">References</span>
        </div>
        {readOnly ? null : (
          <button type="button" onClick={addRow} className="btn-secondary text-[11px]">
            <Upload size={11} aria-hidden /> Add reference
          </button>
        )}
      </header>
      <ul className="divide-y divide-zinc-100">
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
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-700"
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
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-zinc-900">Risk matrix · 5 × 5</p>
        {frozen ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
            <Lock size={9} aria-hidden /> Frozen with this version
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="text-[10px]">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500" />
              {[1, 2, 3, 4, 5].map((l) => (
                <th key={l} className="px-2 py-1 text-center text-[10px] font-semibold text-zinc-600">
                  L{l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[5, 4, 3, 2, 1].map((c) => (
              <tr key={c}>
                <th className="px-2 py-1 text-left text-[10px] font-semibold text-zinc-600">C{c}</th>
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
                      className={`px-3 py-2 text-center font-semibold ${colors[band]}`}
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
      <div className="mt-3 grid gap-1 text-[11px] text-zinc-600 sm:grid-cols-2">
        <div>
          <p className="font-semibold text-zinc-700">Risk bands</p>
          <ul className="mt-1 space-y-0.5">
            {Object.values(RISK_BANDS).map((band) => (
              <li key={band.id} className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded ${band.bg}`} />
                <span>
                  {band.id} ({band.min}–{band.max})
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-zinc-700">Consequence axes</p>
          <ul className="mt-1 list-disc pl-4">
            {CONSEQUENCE_AXES.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
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
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
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
