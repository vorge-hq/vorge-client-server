import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { Banner } from "../../components/Banner";
import { Modal } from "../../components/Modal";
import { FormField, TextArea } from "../../components/FormField";
import { AssessmentShell } from "../../layouts/AssessmentShell";
import { ASSESSMENTS, getAssessmentBundle } from "../../data/assessments";
import { isAssessmentReadOnly } from "../../features/assessmentWorkspace/assessmentModel";
import { ExecutiveSummarySection } from "../../features/assessmentWorkspace/sections/ExecutiveSummarySection";
import { FacilityInfoSection } from "../../features/assessmentWorkspace/sections/FacilityInfoSection";
import { AssetDisaggregationSection } from "../../features/assessmentWorkspace/sections/AssetDisaggregationSection";
import { ThreatAssessmentSection } from "../../features/assessmentWorkspace/sections/ThreatAssessmentSection";
import { AssetThreatMatrixSection } from "../../features/assessmentWorkspace/sections/AssetThreatMatrixSection";
import { EvaluationSection } from "../../features/assessmentWorkspace/sections/EvaluationSection";
import { MitigationSection } from "../../features/assessmentWorkspace/sections/MitigationSection";
import { ConclusionSection } from "../../features/assessmentWorkspace/sections/ConclusionSection";
import { AppendicesSection } from "../../features/assessmentWorkspace/sections/AppendicesSection";

const ACTION_COPY = {
  submit: { title: "Submit for review", confirm: "Submit", reasonRequired: false, tone: "default" },
  withdraw: {
    title: "Withdraw submission",
    confirm: "Withdraw",
    reasonRequired: false,
    tone: "default"
  },
  "review-complete": {
    title: "Mark review complete",
    confirm: "Mark complete",
    reasonRequired: false,
    tone: "default"
  },
  "send-back-author": {
    title: "Send back to Author",
    confirm: "Send back",
    reasonRequired: true,
    tone: "warn"
  },
  approve: { title: "Approve assessment", confirm: "Approve", reasonRequired: false, tone: "default" },
  "send-back-reviewer": {
    title: "Send back to Reviewer",
    confirm: "Send back",
    reasonRequired: true,
    tone: "warn"
  },
  reject: { title: "Reject to Draft", confirm: "Reject", reasonRequired: true, tone: "danger" }
};

function ActionModal({ action, onClose, onConfirm }) {
  const meta = ACTION_COPY[action];
  if (!meta) {
    return null;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={meta.title}
      tone={meta.tone}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="action-form"
            className={meta.tone === "danger" ? "btn-danger" : meta.tone === "warn" ? "btn-warn" : "btn-primary"}
          >
            {meta.confirm}
          </button>
        </>
      }
    >
      <form
        id="action-form"
        onSubmit={(event) => {
          event.preventDefault();
          const reason = event.currentTarget.elements.reason?.value || "";
          onConfirm({ action, reason });
        }}
        className="grid gap-3"
      >
        <p>
          {meta.reasonRequired
            ? "A reason is required for this action and will be visible to the recipient."
            : "Confirm to record this action. The audit log entry is immutable."}
        </p>
        {meta.reasonRequired ? (
          <FormField label="Reason" required>
            <TextArea name="reason" required minLength={5} rows={4} placeholder="What needs to change?" />
          </FormField>
        ) : null}
      </form>
    </Modal>
  );
}

function renderSection({ sectionId, assessment, bundle, readOnly }) {
  switch (sectionId) {
    case 1:
      return <ExecutiveSummarySection assessment={assessment} readOnly={readOnly} />;
    case 2:
      return <FacilityInfoSection assessment={assessment} readOnly={readOnly} />;
    case 3:
      return <AssetDisaggregationSection bundle={bundle} readOnly={readOnly} />;
    case 4:
      return <ThreatAssessmentSection bundle={bundle} readOnly={readOnly} />;
    case 5:
      return <AssetThreatMatrixSection bundle={bundle} readOnly={readOnly} />;
    case 6:
      return <EvaluationSection bundle={bundle} readOnly={readOnly} />;
    case 7:
      return <MitigationSection assessment={assessment} bundle={bundle} />;
    case 8:
      return <ConclusionSection assessment={assessment} readOnly={readOnly} />;
    case 9:
      return <AppendicesSection assessment={assessment} readOnly={readOnly} />;
    default:
      return null;
  }
}

export function AssessmentWorkspacePage() {
  const params = useParams();
  const { session } = useAuth();
  const [pendingAction, setPendingAction] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const assessmentId = params.assessmentId || ASSESSMENTS[0].id;
  const sectionId = Number(params.sectionId || 1);

  const bundle = useMemo(() => getAssessmentBundle(assessmentId), [assessmentId]);

  if (!bundle) {
    return <Navigate to="/assessments" replace />;
  }

  const { assessment } = bundle;
  const readOnly = isAssessmentReadOnly({
    state: assessment.state,
    actingRole: session.actingRole
  });

  function handleAction(actionId) {
    setPendingAction(actionId);
  }

  function handleConfirm({ action, reason }) {
    setPendingAction(null);
    setConfirmation({ action, reason, timestamp: new Date().toISOString() });
  }

  return (
    <>
      {confirmation ? (
        <Banner tone="success" title="Action recorded">
          {ACTION_COPY[confirmation.action]?.confirm} action submitted at{" "}
          {new Date(confirmation.timestamp).toLocaleString()}.{" "}
          {confirmation.reason ? `Reason: "${confirmation.reason}"` : "No reason captured."}
        </Banner>
      ) : null}

      <AssessmentShell
        assessment={assessment}
        activeSectionId={sectionId}
        onAction={handleAction}
      >
        {renderSection({ sectionId, assessment, bundle, readOnly })}
      </AssessmentShell>

      {pendingAction ? (
        <ActionModal
          action={pendingAction}
          onClose={() => setPendingAction(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
}
