import { useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthContext";
import { Banner } from "../../../components/Banner";
import { CommentAffordance } from "../../../components/CommentAffordance";
import { FormField, Select, TextArea, TextInput } from "../../../components/FormField";
import { useOperatorMemory } from "../../../hooks/useOperatorMemory";
import { getCommentPermission } from "../assessmentModel";
import { useWorkspace } from "../WorkspaceContext";
import { parseFacilityInfo, serializeFacilityInfo } from "../../../api/adapters";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const FACILITY_TYPES = ["Refinery", "Marine Terminal", "Depot", "FPSO", "Process Facility", "Other"];
const NATURE_OPTIONS = [
  "Refining and product blending",
  "Crude storage and export",
  "Marine product transfer",
  "Production and processing"
];
const REGULATORS = [
  "Department of Petroleum Resources",
  "Nigerian Maritime Administration",
  "Dutch Safety Board",
  "Maritime and Port Authority of Singapore",
  "Other"
];

export function FacilityInfoSection({ assessment, readOnly, errors }) {
  const { session } = useAuth();
  const { saveSectionText, showToast } = useWorkspace();
  const operatorId = session?.facility?.operatorId || "op-a";
  const { suggestionsFor, recordFacility } = useOperatorMemory(operatorId);

  /* §2 is a structured form persisted as JSON in the section-2 content_text
     column (2026-07-04 decision). Initialise from the stored blob when present
     (prod hydration set `facilityInfo` to the JSON string), else the demo
     defaults; parseFacilityInfo merges over these so a legacy/plain value or a
     newly-added field degrades gracefully. */
  const DEFAULTS = {
    name: assessment?.facilityName || "Eko Petrochemical Hub",
    region: "Lagos, Nigeria",
    location: "12.07°N, 3.87°E",
    nature: NATURE_OPTIONS[0],
    type: "Refinery",
    manager: "Daniel Mensah",
    regulated: "Yes",
    regulator: "Department of Petroleum Resources",
    general:
      "Eko Petrochemical Hub is the primary refining and export facility for Operator A in the Lagos region. The site comprises a process unit, tank farm, control room, marine loading terminal, fuel loading skid, and supporting administration buildings. Operations run 24/7 with shift handovers at 06:00 and 18:00 local time."
  };
  const [data, setData] = useState(() => parseFacilityInfo(assessment?.facilityInfo, DEFAULTS));
  const [conflict, setConflict] = useState(null);
  // Last value persisted to the server, so an unchanged blur fires no PUT.
  const lastSavedRef = useRef(serializeFacilityInfo(parseFacilityInfo(assessment?.facilityInfo, DEFAULTS)));

  const commentKind = getCommentPermission({
    actingRole: session.actingRole,
    state: assessment?.state
  });

  function update(field, value) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  /* On blur we do two things: (1) record the facility shape into operator-scoped
     memory for autocomplete (both modes, cheap, deduped by name); (2) persist the
     whole form. Persistence goes through the shared section seam serialized as
     JSON — in prod a live PUT /sections/2 with the lockVersion the client read
     (a lost race renders the reload affordance); in demo, fixtures only, no
     network. Skipped when nothing changed since the last save. */
  async function handleBlur() {
    if (readOnly) return;
    recordFacility({
      name: data.name,
      region: data.region,
      location: data.location,
      type: data.type,
      manager: data.manager,
      regulator: data.regulator
    });

    const serialized = serializeFacilityInfo(data);
    if (serialized === lastSavedRef.current) return;

    const result = await saveSectionText({
      assessmentId: assessment.id,
      sectionNumber: 2,
      contentText: serialized,
      lockVersion: assessment?.lockVersion ?? 1,
      actingRole: session.actingRole
    });
    if (result?.conflict) {
      setConflict(result.error);
    } else if (result?.error) {
      showToast(result.error, { tone: "error" });
    } else {
      lastSavedRef.current = serialized;
      setConflict(null);
    }
  }

  const inputProps = (field) => ({
    value: data[field],
    onChange: (event) => update(field, event.target.value),
    onBlur: handleBlur,
    disabled: readOnly
  });

  /* Suggestion lists pulled from this operator's prior entries. Empty
     arrays render an empty <datalist> which is harmless. */
  const nameSuggestions = suggestionsFor("name");
  const regionSuggestions = suggestionsFor("region");
  const locationSuggestions = suggestionsFor("location");
  const managerSuggestions = suggestionsFor("manager");

  return (
    <SectionShell
      number={2}
      title="Facility Information"
      description="Core identifying information for the facility. Section 3 breaks the facility into its assets (control room, tank farm, etc.)."
      actions={
        commentKind ? (
          <CommentAffordance
            section="Section 2 — Facility Information"
            sectionId={2}
            kind={commentKind}
          />
        ) : null
      }
    >
      <ValidationSummary errors={errors} />
      {conflict ? (
        <Banner tone="error" title="Changes not saved">
          {conflict}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline font-medium">
            Reload
          </button>
        </Banner>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Facility name" htmlFor="facility-name">
          <TextInput
            id="facility-name"
            list="facility-name-suggestions"
            autoComplete="off"
            {...inputProps("name")}
          />
          <datalist id="facility-name-suggestions">
            {nameSuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Country / region" htmlFor="region">
          <TextInput
            id="region"
            list="facility-region-suggestions"
            autoComplete="off"
            {...inputProps("region")}
          />
          <datalist id="facility-region-suggestions">
            {regionSuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Location" htmlFor="location">
          <TextInput
            id="location"
            placeholder="Coordinates or address"
            list="facility-location-suggestions"
            autoComplete="off"
            {...inputProps("location")}
          />
          <datalist id="facility-location-suggestions">
            {locationSuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Nature of operation" htmlFor="nature">
          <Select id="nature" {...inputProps("nature")}>
            {NATURE_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
            <option value="Other">Other</option>
          </Select>
        </FormField>
        <FormField label="Facility type" htmlFor="type">
          <Select id="type" {...inputProps("type")}>
            {FACILITY_TYPES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Accountable manager" htmlFor="manager">
          <TextInput
            id="manager"
            list="facility-manager-suggestions"
            autoComplete="off"
            {...inputProps("manager")}
          />
          <datalist id="facility-manager-suggestions">
            {managerSuggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Regulated asset" htmlFor="regulated">
          <Select id="regulated" {...inputProps("regulated")}>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </Select>
        </FormField>
        <FormField label="Regulatory authority" htmlFor="regulator">
          <Select id="regulator" {...inputProps("regulator")}>
            {REGULATORS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="General information" htmlFor="general">
        <TextArea id="general" rows={6} {...inputProps("general")} />
      </FormField>
    </SectionShell>
  );
}
