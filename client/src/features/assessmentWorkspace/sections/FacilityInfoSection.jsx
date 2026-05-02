import { useAuth } from "../../../auth/AuthContext";
import { FormField, Select, TextArea, TextInput } from "../../../components/FormField";
import { FACILITIES } from "../../../data/operators";
import { SectionShell } from "./SectionShell";

export function FacilityInfoSection({ assessment, readOnly }) {
  const { session } = useAuth();
  const facility = FACILITIES.find((entry) => entry.id === assessment.facilityId) || session.facility;

  return (
    <SectionShell
      number={2}
      title="Facility / Asset Information"
      description="Structured metadata for the operating site. Configurable enums fall back to free text via 'Other'."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Facility name" required>
          <TextInput defaultValue={facility.name} disabled={readOnly} />
        </FormField>
        <FormField label="Country / Region">
          <TextInput defaultValue={facility.region} disabled={readOnly} />
        </FormField>
        <FormField label="Asset / Facility type">
          <Select defaultValue={facility.type} disabled={readOnly}>
            <option>Refinery</option>
            <option>Marine Terminal</option>
            <option>FPSO</option>
            <option>Depot</option>
            <option>Mine</option>
            <option>Other</option>
          </Select>
        </FormField>
        <FormField label="Nature of operation">
          <TextInput defaultValue="Oil and gas operations" disabled={readOnly} />
        </FormField>
        <FormField label="Accountable business manager">
          <TextInput defaultValue={facility.accountableManager} disabled={readOnly} />
        </FormField>
        <FormField label="Regulated asset">
          <Select defaultValue={facility.regulated ? "Yes" : "No"} disabled={readOnly}>
            <option>Yes</option>
            <option>No</option>
          </Select>
        </FormField>
        <FormField label="Regulator" hint="Authority responsible for inspection or assurance.">
          <TextInput defaultValue={facility.regulator} disabled={readOnly} />
        </FormField>
        <FormField label="Operator">
          <TextInput defaultValue={session.facility.operator} disabled={readOnly} />
        </FormField>
      </div>

      <FormField label="General information" hint="Materiality, complexities, operating posture, and other context.">
        <TextArea
          rows={6}
          disabled={readOnly}
          defaultValue="Bonny Refinery operates a 210,000 bpd capacity downstream complex with adjacent marine loading. Site profile includes ageing utility infrastructure with active modernisation programme and a 24/7 operations posture."
        />
      </FormField>
    </SectionShell>
  );
}
