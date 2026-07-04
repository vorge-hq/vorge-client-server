import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { isDemoEnabled } from "../../auth/demoFlag";
import { listAssessments } from "../../api/assessmentApi";
import { toClientAssessment } from "../../api/adapters";
import { Card, CardHeader } from "../../components/Card";
import { StateChip } from "../../components/Chip";
import { FormField, Select, TextInput } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { NewAssessmentModal } from "../../features/assessmentWorkspace/modals";
import { FACILITIES } from "../../data/operators";
import {
  ASSESSMENT_STATES,
  STATE_DESCRIPTORS,
  filterAssessmentsForRole
} from "../../features/assessmentWorkspace/assessmentModel";

const STATE_OPTIONS = Object.values(ASSESSMENT_STATES);

function getFacilityName(assessment) {
  return (
    assessment.facilityName ||
    FACILITIES.find((facility) => facility.id === assessment.facilityId)?.name ||
    assessment.facilityId
  );
}

export function AssessmentsListPage() {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [stateFilter, setStateFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("All");
  const [newOpen, setNewOpen] = useState(false);

  // Prod reads: fetch the live, server-scoped list once on mount. Demo mode
  // keeps its fixtures (via the workspace) and fires no request. In prod we do
  // NOT re-apply the client's per-user role narrowing — the server already
  // returned exactly what the acting role may read (decision 2026-07-03).
  const demo = isDemoEnabled();
  const [prodAssessments, setProdAssessments] = useState(null);
  const [loadError, setLoadError] = useState(null);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    listAssessments(session.actingRole)
      .then((payload) => {
        if (!cancelled) setProdAssessments((payload.assessments || []).map(toClientAssessment));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || "Could not load assessments.");
      });
    return () => {
      cancelled = true;
    };
  }, [demo, session.actingRole]);

  const accessibleFacilityIds = useMemo(
    () => session.facilities.map((facility) => facility.id),
    [session.facilities]
  );

  const filtered = useMemo(() => {
    // Prod: server already role/facility-scoped the rows — no client narrowing.
    // Demo: keep the fixture-era per-user filter.
    const source = demo
      ? filterAssessmentsForRole(
          { actingRole: session.actingRole, userId: session.user.id, accessibleFacilityIds },
          Object.values(workspace.assessmentsById)
        )
      : prodAssessments || [];
    return source
      .filter((assessment) =>
        facilityFilter === "All" ? true : assessment.facilityId === facilityFilter
      )
      .filter((assessment) => (stateFilter === "All" ? true : assessment.state === stateFilter))
      .filter((assessment) =>
        search ? assessment.name.toLowerCase().includes(search.toLowerCase()) : true
      )
      .sort((a, b) => (a.lastUpdated < b.lastUpdated ? 1 : -1));
  }, [
    demo,
    prodAssessments,
    session.actingRole,
    session.user.id,
    accessibleFacilityIds,
    facilityFilter,
    search,
    stateFilter,
    workspace.assessmentsById
  ]);

  const facilityOptions = useMemo(
    () => session.facilities.filter((facility) => accessibleFacilityIds.includes(facility.id)),
    [session.facilities, accessibleFacilityIds]
  );

  return (
    <section className="grid gap-6">
      <PageHeader
        eyebrow="Assessments"
        title="All assessments"
        description="Filter by state, facility, or search by name. Cards show progress, residual risk, and your role."
        actions={
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} aria-hidden /> New assessment
          </button>
        }
      />

      <Card>
        <CardHeader eyebrow="Filters" title="Refine your list" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <FormField label="Search">
            <TextInput
              type="search"
              placeholder="Search by name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
          <FormField label="State">
            <Select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              <option>All</option>
              {STATE_OPTIONS.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Facility">
            <Select
              value={facilityFilter}
              onChange={(event) => setFacilityFilter(event.target.value)}
            >
              <option value="All">All facilities</option>
              {facilityOptions.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      <ul className="grid gap-3">
        {loadError ? (
          <li className="surface-card p-6 text-center text-sm text-rose-600">{loadError}</li>
        ) : !demo && prodAssessments === null ? (
          <li className="surface-card p-6 text-center text-sm text-zinc-500">Loading assessments…</li>
        ) : filtered.length === 0 ? (
          <li className="surface-card p-6 text-center text-sm text-zinc-500">
            No assessments match these filters.
          </li>
        ) : (
          filtered.map((assessment) => {
            const completion = Math.round(((assessment.completedSectionIds?.length || 0) / 9) * 100);
            const stateMeta = STATE_DESCRIPTORS[assessment.state];
            return (
              <li key={assessment.id} className="surface-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StateChip state={assessment.state} />
                      <span className="text-xs text-zinc-500">Cycle {assessment.cycle}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-zinc-900">{assessment.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Facility · {getFacilityName(assessment)} · Updated{" "}
                      {assessment.lastUpdated ? new Date(assessment.lastUpdated).toLocaleString() : "—"}
                    </p>
                    <p className="mt-2 text-xs text-zinc-600">{stateMeta?.description}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-zinc-700">
                        {completion}% complete
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to={`/assessments/${assessment.id}/sections/1`}
                      className="btn-primary"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {newOpen ? (
        <NewAssessmentModal
          onClose={() => setNewOpen(false)}
          onCreate={() => {
            setNewOpen(false);
            workspace.showToast("New assessment created");
          }}
        />
      ) : null}
    </section>
  );
}
