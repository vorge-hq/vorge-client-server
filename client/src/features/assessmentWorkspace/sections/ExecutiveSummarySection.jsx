import { Banner } from "../../../components/Banner";
import { FormField, TextArea } from "../../../components/FormField";
import { SectionShell } from "./SectionShell";

export function ExecutiveSummarySection({ assessment, readOnly }) {
  return (
    <SectionShell
      number={1}
      title="Executive Summary"
      description="A concise narrative typically authored at the end. AI drafting assists Authors when enabled."
      actions={
        !readOnly ? (
          <button type="button" className="btn-secondary">Generate AI draft</button>
        ) : null
      }
    >
      <Banner tone="info" title="AI drafting is optional">
        AI-drafted text is clearly labelled and saved alongside the human-edited final version in the audit log.
      </Banner>

      <FormField label="Executive summary" hint="Markdown is supported. Autosave runs every save.">
        <TextArea
          rows={10}
          defaultValue={assessment.executiveSummary}
          disabled={readOnly}
          placeholder="Capture facility purpose, residual risk, key mitigations, and Approver-relevant context."
        />
      </FormField>
    </SectionShell>
  );
}
