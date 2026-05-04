import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ASSESSMENTS, ACTIVE_ASSESSMENT_ID } from "../../data/assessments";
import { DEFAULT_ASSETS } from "../../data/assets";
import { DEFAULT_THREATS } from "../../data/threats";
import { ASSET_THREAT_LINKS, EVALUATIONS, SEED_MATRIX } from "../../data/evaluations";
import { MITIGATIONS, MY_MITIGATIONS } from "../../data/mitigations";
import { AUDIT_LOG } from "../../data/auditLog";
import { validateMitigationUpdate } from "../mitigationOwner/mitigationRules";
import {
  WORKFLOW_ACTIONS,
  applyDemoRoleSideEffects,
  applyWorkflowAction,
  getInitialAssessmentState
} from "./workflowReducer";

const WorkspaceContext = createContext(null);

function buildInitialState() {
  const assessmentsById = {};
  ASSESSMENTS.forEach((assessment) => {
    assessmentsById[assessment.id] = {
      ...assessment,
      ...getInitialAssessmentState(assessment)
    };
  });
  return {
    assessmentsById,
    activeAssessmentId: ACTIVE_ASSESSMENT_ID,
    assets: DEFAULT_ASSETS,
    threats: DEFAULT_THREATS,
    matrix: { ...SEED_MATRIX },
    links: ASSET_THREAT_LINKS,
    evaluations: EVALUATIONS,
    mitigations: MITIGATIONS,
    myMitigations: MY_MITIGATIONS,
    audit: AUDIT_LOG,
    toast: null
  };
}

export function WorkspaceProvider({ children }) {
  const [state, setState] = useState(buildInitialState);

  const showToast = useCallback((message) => {
    setState((current) => ({ ...current, toast: message }));
    setTimeout(() => {
      setState((current) => (current.toast === message ? { ...current, toast: null } : current));
    }, 2400);
  }, []);

  const dismissToast = useCallback(() => {
    setState((current) => ({ ...current, toast: null }));
  }, []);

  const dispatchWorkflowAction = useCallback((options) => {
    let result;
    setState((current) => {
      const assessmentId = options.assessmentId || current.activeAssessmentId;
      const assessment = current.assessmentsById[assessmentId];
      if (!assessment) {
        result = { error: "Assessment not found" };
        return current;
      }
      const facility = current.assessmentsById[assessmentId];
      const actionResult = applyWorkflowAction(assessment, {
        type: options.type,
        actor: options.actor,
        assessment: {
          ...assessment,
          facilityName: facility.facility?.name || assessment.facilityId
        },
        reason: options.reason || "",
        note: options.note || ""
      });
      if (actionResult.error) {
        result = actionResult;
        return current;
      }
      const nextAssessment = { ...assessment, ...actionResult.next };
      const nextAudit = actionResult.auditEntry
        ? [actionResult.auditEntry, ...current.audit]
        : current.audit;
      result = { ok: true };
      return {
        ...current,
        assessmentsById: { ...current.assessmentsById, [assessmentId]: nextAssessment },
        audit: nextAudit
      };
    });
    return result;
  }, []);

  const applyDemoRoleSwitch = useCallback((role) => {
    setState((current) => {
      const assessment = current.assessmentsById[current.activeAssessmentId];
      if (!assessment) return current;
      const next = applyDemoRoleSideEffects(assessment, role);
      if (next === assessment) return current;
      return {
        ...current,
        assessmentsById: { ...current.assessmentsById, [current.activeAssessmentId]: { ...assessment, ...next } }
      };
    });
  }, []);

  const dispatchMitigationUpdate = useCallback((options) => {
    let result;
    setState((current) => {
      const target = current.myMitigations.find((m) => m.id === options.mitigationId);
      if (!target) {
        result = { error: "Mitigation not found" };
        return current;
      }
      const validation = validateMitigationUpdate({
        currentStatus: target.status,
        nextStatus: options.status,
        note: options.note,
        assessmentState: target.assessmentState
      });
      if (!validation.valid) {
        result = { error: validation.errors.join(" ") };
        return current;
      }

      const ts = new Date().toISOString();
      const newLogEntry = options.note
        ? {
            id: `log-${target.id}-${Date.now()}`,
            timestamp: ts,
            userName: options.userName || "Mitigation Owner",
            roleLabel: options.roleLabel || "IT Security",
            text: options.note,
            statusChange:
              options.status !== target.status ? { from: target.status, to: options.status } : null
          }
        : null;
      const updated = {
        ...target,
        status: options.status,
        log: newLogEntry ? [...target.log, newLogEntry] : target.log
      };

      const newAudit = {
        id: `au-mit-${Date.now()}`,
        timestamp: ts,
        user: options.userName || "Mitigation Owner",
        role: "Mitigation Owner",
        facility: target.facility,
        assessment: `${target.facility} — ${target.cycle}`,
        action: "mitigation-update",
        detail: `${target.assetThreat} — status: ${options.status}${
          options.note ? `, note recorded` : ""
        }`,
        section: "Mitigation",
        ip: "102.89.34.45"
      };

      result = { ok: true, mitigation: updated };
      return {
        ...current,
        myMitigations: current.myMitigations.map((m) => (m.id === updated.id ? updated : m)),
        audit: [newAudit, ...current.audit]
      };
    });
    return result;
  }, []);

  const updateAsset = useCallback((assetId, updates) => {
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) =>
        asset.id === assetId ? { ...asset, ...updates } : asset
      )
    }));
  }, []);

  const addAsset = useCallback((asset) => {
    setState((current) => ({
      ...current,
      assets: [...current.assets, asset]
    }));
  }, []);

  const removeAsset = useCallback((assetId) => {
    setState((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId)
    }));
  }, []);

  const updateThreat = useCallback((threatId, updates) => {
    setState((current) => ({
      ...current,
      threats: current.threats.map((threat) =>
        threat.id === threatId ? { ...threat, ...updates } : threat
      )
    }));
  }, []);

  const addThreat = useCallback((threat) => {
    setState((current) => ({
      ...current,
      threats: [...current.threats, threat]
    }));
  }, []);

  const removeThreat = useCallback((threatId) => {
    setState((current) => {
      const cleanedMatrix = Object.fromEntries(
        Object.entries(current.matrix).filter(([key]) => !key.endsWith(`|${threatId}`))
      );
      return {
        ...current,
        threats: current.threats.filter((threat) => threat.id !== threatId),
        matrix: cleanedMatrix
      };
    });
  }, []);

  const updateMitigation = useCallback((mitigationId, updates) => {
    setState((current) => {
      const existing = current.mitigations.find((m) => m.id === mitigationId);
      const next = existing
        ? current.mitigations.map((m) => (m.id === mitigationId ? { ...m, ...updates } : m))
        : [...current.mitigations, { id: mitigationId, ...updates }];
      return { ...current, mitigations: next };
    });
  }, []);

  const dispatchComment = useCallback((options) => {
    if (!options?.comment?.trim()) return { error: "Comment is empty." };
    let result;
    setState((current) => {
      const assessment = current.assessmentsById[current.activeAssessmentId];
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
      const entry = {
        id: `au-comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: ts,
        user: options.actor?.name || "Reviewer",
        role: options.actor?.role || "Reviewer",
        facility: assessment?.facilityName || "—",
        assessment: assessment?.name || "—",
        action: "comment",
        detail: options.anchor
          ? `${options.section} · ${options.anchor} — "${options.comment.trim()}"`
          : `${options.section} — "${options.comment.trim()}"`,
        section: options.section,
        sectionId: options.sectionId ?? null,
        ip: "102.89.34.45"
      };
      result = { ok: true, entry };
      return { ...current, audit: [entry, ...current.audit] };
    });
    return result;
  }, []);

  const toggleMatrix = useCallback((assetId, threatId) => {
    setState((current) => {
      const key = `${assetId}|${threatId}`;
      const next = { ...current.matrix };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return { ...current, matrix: next };
    });
  }, []);

  const updateEvaluation = useCallback((evaluationId, updates) => {
    setState((current) => ({
      ...current,
      evaluations: current.evaluations.map((evaluation) =>
        evaluation.id === evaluationId ? { ...evaluation, ...updates } : evaluation
      )
    }));
  }, []);

  const upsertEvaluation = useCallback((evaluation) => {
    setState((current) => {
      const existing = current.evaluations.find((e) => e.id === evaluation.id);
      const evaluations = existing
        ? current.evaluations.map((e) => (e.id === evaluation.id ? { ...e, ...evaluation } : e))
        : [...current.evaluations, evaluation];
      return { ...current, evaluations };
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      showToast,
      dismissToast,
      dispatchWorkflowAction,
      applyDemoRoleSwitch,
      dispatchMitigationUpdate,
      dispatchComment,
      updateAsset,
      addAsset,
      removeAsset,
      updateThreat,
      addThreat,
      removeThreat,
      updateMitigation,
      toggleMatrix,
      updateEvaluation,
      upsertEvaluation,
      WORKFLOW_ACTIONS
    }),
    [
      state,
      showToast,
      dismissToast,
      dispatchWorkflowAction,
      applyDemoRoleSwitch,
      dispatchMitigationUpdate,
      dispatchComment,
      updateAsset,
      addAsset,
      removeAsset,
      updateThreat,
      addThreat,
      removeThreat,
      updateMitigation,
      toggleMatrix,
      updateEvaluation,
      upsertEvaluation
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return value;
}

export function useAssessment(assessmentId) {
  const ws = useWorkspace();
  const id = assessmentId || ws.activeAssessmentId;
  return ws.assessmentsById[id] || null;
}
