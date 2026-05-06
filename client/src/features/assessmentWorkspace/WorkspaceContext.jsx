import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ASSESSMENTS, ACTIVE_ASSESSMENT_ID, HQ_AGGREGATE } from "../../data/assessments";
import { DEFAULT_ASSETS } from "../../data/assets";
import { DEFAULT_THREATS } from "../../data/threats";
import { ASSET_THREAT_LINKS, EVALUATIONS, SEED_MATRIX } from "../../data/evaluations";
import { MITIGATIONS, MY_MITIGATIONS } from "../../data/mitigations";
import { AUDIT_LOG } from "../../data/auditLog";
import { NOTIFICATIONS } from "../../data/notifications";
import { USERS } from "../../data/users";
import { ADMIN_USERS, FACILITY_ASSIGNMENTS } from "../../data/admin";
import { VERSIONS } from "../../data/versions";
import { LIBRARY_SCENARIOS } from "../../data/library";
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
    notifications: NOTIFICATIONS,
    users: USERS,
    hqAggregate: HQ_AGGREGATE,
    adminUsers: ADMIN_USERS,
    facilityAssignments: FACILITY_ASSIGNMENTS,
    versions: VERSIONS,
    libraryScenarios: LIBRARY_SCENARIOS,
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

  const applyWorkflowTransition = useCallback(async (options) => {
    return new Promise((resolve) => {
      setState((current) => {
        const assessmentId = options.assessmentId || current.activeAssessmentId;
        const assessment = current.assessmentsById[assessmentId];
        if (!assessment) {
          queueMicrotask(() => resolve({ error: "Assessment not found" }));
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
          queueMicrotask(() => resolve(actionResult));
          return current;
        }
        const nextAssessment = { ...assessment, ...actionResult.next };
        const nextAudit = actionResult.auditEntry
          ? [actionResult.auditEntry, ...current.audit]
          : current.audit;
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          assessmentsById: { ...current.assessmentsById, [assessmentId]: nextAssessment },
          audit: nextAudit
        };
      });
    });
  }, []);

  const applyDemoRoleSwitch = useCallback(async (role) => {
    return new Promise((resolve) => {
      setState((current) => {
        const assessment = current.assessmentsById[current.activeAssessmentId];
        if (!assessment) {
          queueMicrotask(() => resolve({ ok: true }));
          return current;
        }
        const next = applyDemoRoleSideEffects(assessment, role);
        if (next === assessment) {
          queueMicrotask(() => resolve({ ok: true }));
          return current;
        }
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          assessmentsById: { ...current.assessmentsById, [current.activeAssessmentId]: { ...assessment, ...next } }
        };
      });
    });
  }, []);

  const appendMitigationLogEntry = useCallback(async (options) => {
    return new Promise((resolve) => {
      setState((current) => {
        const target = current.myMitigations.find((m) => m.id === options.mitigationId);
        if (!target) {
          queueMicrotask(() => resolve({ error: "Mitigation not found" }));
          return current;
        }
        const validation = validateMitigationUpdate({
          currentStatus: target.status,
          nextStatus: options.status,
          note: options.note,
          assessmentState: target.assessmentState
        });
        if (!validation.valid) {
          queueMicrotask(() => resolve({ error: validation.errors.join(" ") }));
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

        queueMicrotask(() => resolve({ ok: true, mitigation: updated }));
        return {
          ...current,
          myMitigations: current.myMitigations.map((m) => (m.id === updated.id ? updated : m)),
          audit: [newAudit, ...current.audit]
        };
      });
    });
  }, []);

  const updateAsset = useCallback(async (assetId, updates) => {
    return new Promise((resolve) => {
      setState((current) => {
        const next = {
          ...current,
          assets: current.assets.map((asset) =>
            asset.id === assetId ? { ...asset, ...updates } : asset
          )
        };
        queueMicrotask(() => resolve({ ok: true }));
        return next;
      });
    });
  }, []);

  const addAsset = useCallback(async (asset) => {
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true }));
        return { ...current, assets: [...current.assets, asset] };
      });
    });
  }, []);

  const removeAsset = useCallback(async (assetId) => {
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          assets: current.assets.filter((asset) => asset.id !== assetId)
        };
      });
    });
  }, []);

  const updateThreat = useCallback(async (threatId, updates) => {
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          threats: current.threats.map((threat) =>
            threat.id === threatId ? { ...threat, ...updates } : threat
          )
        };
      });
    });
  }, []);

  const addThreat = useCallback(async (threat) => {
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true }));
        return { ...current, threats: [...current.threats, threat] };
      });
    });
  }, []);

  const removeThreat = useCallback(async (threatId) => {
    return new Promise((resolve) => {
      setState((current) => {
        const cleanedMatrix = Object.fromEntries(
          Object.entries(current.matrix).filter(([key]) => !key.endsWith(`|${threatId}`))
        );
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          threats: current.threats.filter((threat) => threat.id !== threatId),
          matrix: cleanedMatrix
        };
      });
    });
  }, []);

  const updateMitigation = useCallback(async (mitigationId, updates) => {
    return new Promise((resolve) => {
      setState((current) => {
        const existing = current.mitigations.find((m) => m.id === mitigationId);
        const next = existing
          ? current.mitigations.map((m) => (m.id === mitigationId ? { ...m, ...updates } : m))
          : [...current.mitigations, { id: mitigationId, ...updates }];
        queueMicrotask(() => resolve({ ok: true }));
        return { ...current, mitigations: next };
      });
    });
  }, []);

  const addComment = useCallback(async (options) => {
    if (!options?.comment?.trim()) return { error: "Comment is empty." };
    return new Promise((resolve) => {
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
        queueMicrotask(() => resolve({ ok: true, entry }));
        return { ...current, audit: [entry, ...current.audit] };
      });
    });
  }, []);

  const toggleMatrix = useCallback(async (assetId, threatId) => {
    return new Promise((resolve) => {
      setState((current) => {
        const key = `${assetId}|${threatId}`;
        const next = { ...current.matrix };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = true;
        }
        queueMicrotask(() => resolve({ ok: true }));
        return { ...current, matrix: next };
      });
    });
  }, []);

  const updateEvaluation = useCallback(async (evaluationId, updates) => {
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          evaluations: current.evaluations.map((evaluation) =>
            evaluation.id === evaluationId ? { ...evaluation, ...updates } : evaluation
          )
        };
      });
    });
  }, []);

  const upsertEvaluation = useCallback(async (evaluation) => {
    return new Promise((resolve) => {
      setState((current) => {
        const existing = current.evaluations.find((e) => e.id === evaluation.id);
        const evaluations = existing
          ? current.evaluations.map((e) => (e.id === evaluation.id ? { ...e, ...evaluation } : e))
          : [...current.evaluations, evaluation];
        queueMicrotask(() => resolve({ ok: true }));
        return { ...current, evaluations };
      });
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      showToast,
      dismissToast,
      applyWorkflowTransition,
      applyDemoRoleSwitch,
      appendMitigationLogEntry,
      addComment,
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
      applyWorkflowTransition,
      applyDemoRoleSwitch,
      appendMitigationLogEntry,
      addComment,
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
