import { useState } from "react";
import { FormField, Select, TextArea, TextInput } from "../../../components/FormField";
import { SectionShell } from "./SectionShell";
import { ValidationSummary } from "./ValidationSummary";

const FACILITY_TYPES = ["Refinery", "Marine Terminal", "Depot", "FPSO", "Process Facility", "Other"];
const NATURE_OPTIONS = [
  "Refining and product blending",
  "Crude storage and export",
  "Marine product transfer",
  "Production and processing"
];
const REGULATORS = ["Department of Petroleum Resources", "Nigerian Maritime Administration", "Other"];

export function FacilityInfoSection({ assessment, readOnly, errors }) {
  const [data, setData] = useState({
    name: assessment?.facilityName || "Asset Site 1",
    region: "Lagos, Nigeria",
    location: "12.07°N, 3.87°E",
    nature: NATURE_OPTIONS[0],
    type: "Refinery",
    manager: "C. Adeyemi",
    regulated: "Yes",
    regulator: "Department of Petroleum Resources",
    general:
      "Asset Site 1 is the primary refining and export facility for Operator A in the Lagos region. The site comprises a process unit, tank farm, control room, marine loading terminal, fuel loading skid, and supporting administration buildings. Operations run 24/7 with shift handovers at 06:00 and 18:00 local time."
  });

  function update(field, value) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  const inputProps = (field) => ({
    value: data[field],
    onChange: (event) => update(field, event.target.value),
    disabled: readOnly
  });

  return (
    <SectionShell
      number={2}
      title="Facility / Asset Information"
      description="Core identifying information for the facility under assessment."
    >
      <ValidationSummary errors={errors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Facility name" htmlFor="facility-name">
          <TextInput id="facility-name" {...inputProps("name")} />
        </FormField>
        <FormField label="Country / region" htmlFor="region">
          <TextInput id="region" {...inputProps("region")} />
        </FormField>
        <FormField label="Location" htmlFor="location">
          <TextInput id="location" placeholder="Coordinates or address" {...inputProps("location")} />
        </FormField>
        <FormField label="Nature of operation" htmlFor="nature">
          <Select id="nature" {...inputProps("nature")}>
            {NATURE_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
            <option value="Other">Other</option>
          </Select>
        </FormField>
        <FormField label="Asset / Facility type" htmlFor="type">
          <Select id="type" {...inputProps("type")}>
            {FACILITY_TYPES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Accountable manager" htmlFor="manager">
          <TextInput id="manager" {...inputProps("manager")} />
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
