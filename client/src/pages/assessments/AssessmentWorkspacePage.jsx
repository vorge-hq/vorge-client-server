import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { AssessmentShell } from "../../layouts/AssessmentShell";
import {
  ASSESSMENT_STATES,
  isAssessmentReadOnly
} from "../../features/assessmentWorkspace/assessmentModel";
import { useWorkspace } from "../../features/assessmentWorkspace/WorkspaceContext";
import { WORKFLOW_ACTIONS } from "../../features/assessmentWorkspace/workflowReducer";
import {
  commentCountsBySection,
  validateAssessment
} from "../../features/assessmentWorkspace/sectionValidation";
import {
  AIDraftModal,
  AuditLogPanel,
  DecisionModal,
  FieldModeModal,
  LibraryModal,
  NewAssessmentModal,
  RecallModal,
  SubmitReviewModal,
  VersionsModal
} from "../../features/assessmentWorkspace/modals";
import { ExecutiveSummarySection } from "../../features/assessmentWorkspace/sections/ExecutiveSummarySection";
import { FacilityInfoSection } from "../../features/assessmentWorkspace/sections/FacilityInfoSection";
import { AssetDisaggregationSection } from "../../features/assessmentWorkspace/sections/AssetDisaggregationSection";
import { ThreatAssessmentSection } from "../../features/assessmentWorkspace/sections/ThreatAssessmentSection";
import { AssetThreatMatrixSection } from "../../features/assessmentWorkspace/sections/AssetThreatMatrixSection";
import { EvaluationSection } from "../../features/assessmentWorkspace/sections/EvaluationSection";
import { MitigationSection } from "../../features/assessmentWorkspace/sections/MitigationSection";
import { ConclusionSection } from "../../features/assessmentWorkspace/sections/ConclusionSection";
import { AppendicesSection } from "../../features/assessmentWorkspace/sections/AppendicesSection";

const ACTION_TO_DECISION = {
  "review-complete": "review-complete",
  "send-back-author": "reviewer-send-back",
  approve: "approve",
  "send-back-reviewer": "approver-send-back",
  reject: "reject"
};

const DECISION_TO_WORKFLOW = {
  "review-complete": WORKFLOW_ACTIONS.REVIEW_COMPLETE,
  "reviewer-send-back": WORKFLOW_ACTIONS.REVIEWER_SEND_BACK,
  approve: WORKFLOW_ACTIONS.APPROVE,
  "approver-send-back": WORKFLOW_ACTIONS.APPROVER_SEND_BACK,
  reject: WORKFLOW_ACTIONS.REJECT
};

function renderSection({ sectionId, assessment, readOnly, modalOpeners, errors }) {
  switch (sectionId) {
    case 1:
      return (
        <ExecutiveSummarySection
          assessment={assessment}
          readOnly={readOnly}
          onOpenAIDraft={modalOpeners.openAIDraft}
          errors={errors}
        />
      );
    case 2:
      return <FacilityInfoSection assessment={assessment} readOnly={readOnly} errors={errors} />;
    case 3:
      return (
        <AssetDisaggregationSection assessment={assessment} readOnly={readOnly} errors={errors} />
      );
    case 4:
      return (
        <ThreatAssessmentSection assessment={assessment} readOnly={readOnly} errors={errors} />
      );
    case 5:
      return (
        <AssetThreatMatrixSection assessment={assessment} readOnly={readOnly} errors={errors} />
      );
    case 6:
      return <EvaluationSection assessment={assessment} errors={errors} />;
    case 7:
      return <MitigationSection assessment={assessment} errors={errors} />;
    case 8:
      return (
        <ConclusionSection
          assessment={assessment}
          readOnly={readOnly}
          onOpenAIDraft={modalOpeners.openAIDraft}
          errors={errors}
        />
      );
    case 9:
      return <AppendicesSection assessment={assessment} readOnly={readOnly} errors={errors} />;
    default:
      return null;
  }
}

export function AssessmentWorkspacePage() {
  const params = useParams();
  const { session } = useAuth();
  const workspace = useWorkspace();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [recallMode, setRecallMode] = useState(null);
  const [decisionKind, setDecisionKind] = useState(null);
  const [aiDraftOpen, setAiDraftOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [fieldModeOpen, setFieldModeOpen] = useState(false);
  const [newAssessmentOpen, setNewAssessmentOpen] = useState(false);

  const assessmentId = params.assessmentId;
  const sectionId = Number(params.sectionId || 1);

  const assessment = workspace.assessmentsById[assessmentId];

  useEffect(() => {
    if (!assessment) return;
    if (
      session.actingRole === ROLES.REVIEWER &&
      assessment.state === ASSESSMENT_STATES.IN_REVIEW &&
      assessment.reviewerState !== "opened"
    ) {
      workspace.applyWorkflowTransition({
        assessmentId: assessment.id,
        type: WORKFLOW_ACTIONS.REVIEWER_OPENED,
        actor: { name: session.user.name, role: session.actingRole }
      });
    }
    if (
      session.actingRole === ROLES.APPROVER &&
      assessment.state === ASSESSMENT_STATES.AWAITING_APPROVAL &&
      assessment.approverState !== "opened"
    ) {
      workspace.applyWorkflowTransition({
        assessmentId: assessment.id,
        type: WORKFLOW_ACTIONS.APPROVER_OPENED,
        actor: { name: session.user.name, role: session.actingRole }
      });
    }
  }, [
    assessment?.id,
    assessment?.state,
    assessment?.reviewerState,
    assessment?.approverState,
    session.actingRole,
    session.user.name,
    workspace
  ]);

  if (!assessment) {
    return <Navigate to="/assessments" replace />;
  }

  if (session.actingRole === ROLES.MITIGATION_OWNER) {
    return <Navigate to="/mitigations" replace />;
  }

  const readOnly = isAssessmentReadOnly({
    state: assessment.state,
    actingRole: session.actingRole
  });

  const errorsBySection = useMemo(
    () =>
      validateAssessment({
        assessment,
        assets: workspace.assets,
        threats: workspace.threats,
        evaluations: workspace.evaluations,
        mitigations: workspace.mitigations
      }),
    [assessment, workspace.assets, workspace.threats, workspace.evaluations, workspace.mitigations]
  );

  const commentCounts = useMemo(
    () => commentCountsBySection(workspace.audit),
    [workspace.audit]
  );

  function openAuditPanelForSection(targetSectionId) {
    setAuditFilter({ sectionId: targetSectionId, filter: "comments" });
    setAuditOpen(true);
  }

  function actor() {
    return { name: session.user.name, role: session.actingRole, userId: session.user.id };
  }

  function onAction(actionId) {
    if (actionId === "submit") {
      setSubmitOpen(true);
      return;
    }
    if (actionId === "recall-immediate") {
      setRecallMode("recall-immediate");
      return;
    }
    if (actionId === "reviewer-recall-immediate") {
      setRecallMode("reviewer-recall-immediate");
      return;
    }
    if (actionId === "recall-request") {
      setRecallMode("recall");
      return;
    }
    if (actionId === "recall-request-reviewer") {
      setRecallMode("recall-reviewer");
      return;
    }
    const decision = ACTION_TO_DECISION[actionId];
    if (decision) {
      setDecisionKind(decision);
    }
  }

  async function handleRecallApprove() {
    const result = await workspace.applyWorkflowTransition({
      assessmentId,
      type: WORKFLOW_ACTIONS.RECALL_APPROVE,
      actor: actor()
    });
    workspace.showResultToast(result, "Recall approved");
  }

  async function handleRecallDecline() {
    const result = await workspace.applyWorkflowTransition({
      assessmentId,
      type: WORKFLOW_ACTIONS.RECALL_DECLINE,
      actor: actor(),
      reason: "Declined by receiver"
    });
    workspace.showResultToast(result, "Recall declined");
  }

  const modalOpeners = {
    openAIDraft: () => setAiDraftOpen(true),
    openLibrary: () => setLibraryOpen(true),
    openVersions: () => setVersionsOpen(true),
    openAudit: () => {
      setAuditFilter(null);
      setAuditOpen(true);
    },
    openFieldMode: () => setFieldModeOpen(true),
    openNewAssessment: () => setNewAssessmentOpen(true)
  };

  return (
    <>
      <AssessmentShell
        assessment={assessment}
        activeSectionId={sectionId}
        onAction={onAction}
        onOpenAudit={modalOpeners.openAudit}
        onOpenLibrary={modalOpeners.openLibrary}
        onOpenVersions={modalOpeners.openVersions}
        onOpenAuditFor={openAuditPanelForSection}
        onRecallApprove={handleRecallApprove}
        onRecallDecline={handleRecallDecline}
        commentCounts={commentCounts}
        errorsBySection={errorsBySection}
      >
        {renderSection({
          sectionId,
          assessment,
          readOnly,
          modalOpeners,
          errors: errorsBySection[sectionId]
        })}
      </AssessmentShell>

      {submitOpen ? (
        <SubmitReviewModal
          assets={workspace.assets}
          evaluations={workspace.evaluations}
          onClose={() => setSubmitOpen(false)}
          onSubmit={async () => {
            const result = await workspace.applyWorkflowTransition({
              assessmentId,
              type: WORKFLOW_ACTIONS.SUBMIT,
              actor: actor()
            });
            setSubmitOpen(false);
            workspace.showResultToast(result, "Submitted for review");
          }}
        />
      ) : null}

      {recallMode ? (
        <RecallModal
          mode={recallMode}
          onClose={() => setRecallMode(null)}
          onConfirm={async (reason) => {
            let type;
            let success;
            if (recallMode === "recall-immediate") {
              type = WORKFLOW_ACTIONS.RECALL_IMMEDIATE;
              success = "Recalled to Draft";
            } else if (recallMode === "reviewer-recall-immediate") {
              type = WORKFLOW_ACTIONS.REVIEWER_RECALL_IMMEDIATE;
              success = "Recalled to In Review";
            } else {
              type = WORKFLOW_ACTIONS.RECALL_REQUEST;
              success = "Recall request sent";
            }
            const result = await workspace.applyWorkflowTransition({
              assessmentId,
              type,
              actor: actor(),
              reason
            });
            setRecallMode(null);
            workspace.showResultToast(result, success);
          }}
        />
      ) : null}

      {decisionKind ? (
        <DecisionModal
          kind={decisionKind}
          onClose={() => setDecisionKind(null)}
          onConfirm={async (comment) => {
            const type = DECISION_TO_WORKFLOW[decisionKind];
            if (!type) {
              setDecisionKind(null);
              return;
            }
            const requiresReason = ["reviewer-send-back", "approver-send-back", "reject"].includes(
              decisionKind
            );
            const payload = requiresReason
              ? { reason: comment }
              : { note: comment };
            const result = await workspace.applyWorkflowTransition({
              assessmentId,
              type,
              actor: actor(),
              ...payload
            });
            setDecisionKind(null);
            const successMessages = {
              "review-complete": "Review complete — forwarded to Approver",
              "reviewer-send-back": "Sent back to Author with comments",
              approve: "Assessment approved",
              "approver-send-back": "Sent back to Reviewer",
              reject: "Rejected — returned to Author"
            };
            workspace.showResultToast(result, successMessages[decisionKind]);
          }}
        />
      ) : null}

      {aiDraftOpen ? (
        <AIDraftModal
          assets={workspace.assets}
          evaluations={workspace.evaluations}
          target={
            sectionId === 1
              ? "Section 1 — Executive Summary"
              : sectionId === 8
                ? "Section 8 — Conclusion"
                : "AI draft"
          }
          onClose={() => setAiDraftOpen(false)}
        />
      ) : null}

      {auditOpen ? (
        <AuditLogPanel
          key={`audit-${auditFilter?.sectionId ?? "all"}-${auditFilter?.filter ?? "all"}`}
          entries={workspace.audit}
          assessmentName={assessment.name}
          onClose={() => {
            setAuditOpen(false);
            setAuditFilter(null);
          }}
          initialFilter={auditFilter?.filter || "all"}
          initialSectionId={auditFilter?.sectionId ?? null}
        />
      ) : null}

      {libraryOpen ? <LibraryModal onClose={() => setLibraryOpen(false)} /> : null}
      {versionsOpen ? <VersionsModal onClose={() => setVersionsOpen(false)} /> : null}
      {fieldModeOpen ? <FieldModeModal onClose={() => setFieldModeOpen(false)} /> : null}
      {newAssessmentOpen ? (
        <NewAssessmentModal
          onClose={() => setNewAssessmentOpen(false)}
          onCreate={() => {
            setNewAssessmentOpen(false);
            workspace.showToast("New assessment created");
          }}
        />
      ) : null}
    </>
  );
}
