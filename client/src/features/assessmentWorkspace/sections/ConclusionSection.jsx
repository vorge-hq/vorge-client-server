import { Banner } from "../../../components/Banner";
import { FormField, TextArea } from "../../../components/FormField";
import { SectionShell } from "./SectionShell";

export function ConclusionSection({ assessment, readOnly }) {
  return (
    <SectionShell
      number={8}
      title="Conclusion"
      description="Summarise residual risk, key actions, and confidence in the recommended mitigations."
      actions={
        !readOnly ? (
          <button type="button" className="btn-secondary">Generate AI draft</button>
        ) : null
      }
    >
      <Banner tone="info" title="AI draft is optional">
        Original AI text is preserved next to the human-edited version in the audit log.
      </Banner>

      <FormField label="Conclusion narrative">
        <TextArea
          rows={8}
          defaultValue={assessment.conclusion}
          disabled={readOnly}
          placeholder="Capture overall conclusion, action confidence, and Approver-relevant context."
        />
      </FormField>
    </SectionShell>
  );
}
