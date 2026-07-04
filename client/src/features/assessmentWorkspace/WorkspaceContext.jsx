import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
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
import { evaluationHasAnyData } from "./assessmentModel";
import { isDemoEnabled } from "../../auth/demoFlag";
import {
  putSection,
  getAssessmentBundle,
  isConflict,
  CONFLICT_RELOAD_MESSAGE,
  createAsset as apiCreateAsset,
  updateAsset as apiUpdateAsset,
  deleteAsset as apiDeleteAsset
} from "../../api/assessmentApi";
import {
  toClientAssessment,
  applySectionTexts,
  toClientAsset,
  toClientThreat,
  toClientEvaluation,
  toClientLinks,
  toServerAssetPayload
} from "../../api/adapters";
import {
  WORKFLOW_ACTIONS,
  applyWorkflowAction,
  getInitialAssessmentState
} from "./workflowReducer";

const WorkspaceContext = createContext(null);

// Narrative section number → the assessment field that holds its text.
const SECTION_FIELD = Object.freeze({ 1: "executiveSummary", 2: "facilityInfo", 8: "conclusion" });

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

  /* Always-current mirror of state, so the async prod content mutations can read
     the freshest assets + active-assessment lockVersion at call time (the write
     functions are memoized with [] deps and can't close over `state`). Updated on
     every render; safe to read outside setState because content writes are
     user-paced (blur / click), never mid-keystroke bursts. */
  const stateRef = useRef(state);
  stateRef.current = state;

  /* Merge a server-returned lockVersion into the active assessment. Every content
     mutation bumps assessment.lock_version server-side; syncing it back keeps the
     NEXT write's optimistic-concurrency check from failing against a stale value. */
  const syncLockVersion = (current, assessmentId, lockVersion) => {
    if (lockVersion === undefined || lockVersion === null || !assessmentId) return current.assessmentsById;
    const assessment = current.assessmentsById[assessmentId];
    if (!assessment) return current.assessmentsById;
    return { ...current.assessmentsById, [assessmentId]: { ...assessment, lockVersion } };
  };

  const showToast = useCallback((message, options = {}) => {
    /* Normalize: callers may pass a plain string OR an object
       { message, action, tone }. Internally we always store an object
       with a tone so the Toast component has a uniform contract.
       Tones: "success" (default) | "error" | "warning" | "info". */
    const payload =
      typeof message === "string"
        ? {
            message,
            action: options.action || null,
            tone: options.tone || "success"
          }
        : {
            message: message.message,
            action: message.action || null,
            tone: message.tone || options.tone || "success"
          };
    /* Errors get a longer dwell time so users have time to read and act. */
    const baseDuration = payload.tone === "error" ? 5000 : 2400;
    const duration = options.duration || (payload.action ? Math.max(baseDuration, 4000) : baseDuration);
    setState((current) => ({ ...current, toast: payload }));
    setTimeout(() => {
      setState((current) => (current.toast === payload ? { ...current, toast: null } : current));
    }, duration);
  }, []);

  /* Helper: surface a workspace operation result with the right tone.
     Conventions across the workspace: success returns { ok: true } and
     failures return { error: "message" }. This keeps tone-handling out
     of every caller and guarantees errors are visually distinct. */
  const showResultToast = useCallback(
    (result, successMessage, options = {}) => {
      if (result?.error) {
        showToast(result.error, { ...options, tone: "error" });
        return;
      }
      if (successMessage) {
        showToast(successMessage, options);
      }
    },
    [showToast]
  );

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

  const applyDemoRoleSwitch = useCallback(async () => ({ ok: true }), []);

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

  /* P3 (g) content-entity write — add an asset. PROD fires POST /assets with the
     active assessment's lockVersion, maps the server row (real UUID) back through
     toClientAsset, appends it, and syncs the new lockVersion; a lost race returns
     { conflict }. DEMO appends the passed fixture object unchanged, no network.
     Both modes return { ok, asset } so the caller can expand the created row by
     its (server or client) id. */
  const addAsset = useCallback(async (asset, actingRole) => {
    if (!isDemoEnabled()) {
      const current = stateRef.current;
      const assessmentId = current.activeAssessmentId;
      const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
      try {
        const res = await apiCreateAsset({ assessmentId, lockVersion, actingRole, ...toServerAssetPayload(asset) });
        const created = toClientAsset(res.asset);
        setState((cur) => ({
          ...cur,
          assets: [...cur.assets, created],
          assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion)
        }));
        return { ok: true, asset: created };
      } catch (error) {
        if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
        return { error: error?.message || "Could not add this asset." };
      }
    }
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true, asset }));
        return { ...current, assets: [...current.assets, asset] };
      });
    });
  }, []);

  /* P3 (g) — persist an existing asset's fields (called on field blur; the
     per-keystroke updateAsset above keeps local state optimistic). PROD packs the
     asset's CURRENT value from the ref (plus any `overrides` for a discrete change
     whose setState hasn't flushed yet — e.g. the criticality toggle) and PUTs it
     with the live lockVersion. DEMO is a no-op (local state is already the truth). */
  const persistAsset = useCallback(async (assetId, actingRole, overrides = {}) => {
    if (isDemoEnabled()) return { ok: true };
    const current = stateRef.current;
    const assessmentId = current.activeAssessmentId;
    const existing = current.assets.find((a) => a.id === assetId);
    if (!existing) return { ok: true };
    const asset = { ...existing, ...overrides };
    const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
    try {
      const res = await apiUpdateAsset({ assessmentId, assetId, lockVersion, actingRole, ...toServerAssetPayload(asset) });
      setState((cur) => ({ ...cur, assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion) }));
      return { ok: true };
    } catch (error) {
      if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
      return { error: error?.message || "Could not save this asset." };
    }
  }, []);

  /* Advisory anomaly acknowledgement (AD-1). Writes the ack onto the
     asset keyed by ruleId, and appends an audit entry — atomically, like
     addComment. The criticality/consequences snapshot stored on the ack
     means it auto-invalidates when either field is later edited (no
     explicit clear needed); see useAnomalyAcknowledgement. Advisory only —
     never gates any workflow action. */
  const acknowledgeAnomaly = useCallback(async ({ assetId, ruleId, reason, note, actor }) => {
    return new Promise((resolve) => {
      setState((current) => {
        const asset = current.assets.find((a) => a.id === assetId);
        if (!asset || !ruleId || !reason) {
          queueMicrotask(() => resolve({ error: "Invalid acknowledgement." }));
          return current;
        }
        const assessment = current.assessmentsById[current.activeAssessmentId];
        const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
        const ack = {
          userId: actor?.userId || null,
          reason,
          note: note || "",
          criticalityAt: asset.criticality,
          consequencesAt: asset.consequences,
          at: ts
        };
        const nextAssets = current.assets.map((a) =>
          a.id === assetId
            ? { ...a, anomalyAcks: { ...(a.anomalyAcks || {}), [ruleId]: ack } }
            : a
        );
        const detailReason = note ? `${reason}: ${note}` : reason;
        const entry = {
          id: `au-anomaly-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: ts,
          user: actor?.name || "Author",
          role: actor?.role || "Author",
          facility: assessment?.facilityName || "—",
          assessment: assessment?.name || "—",
          action: "anomaly-ack",
          detail: `${asset.name} — anomaly acknowledged (${detailReason})`,
          section: "Section 3 — Asset Disaggregation",
          sectionId: 3,
          ip: "102.89.34.45"
        };
        queueMicrotask(() => resolve({ ok: true, entry }));
        return { ...current, assets: nextAssets, audit: [entry, ...current.audit] };
      });
    });
  }, []);

  /* P3 (g) — remove an asset. PROD fires DELETE /assets/:id with the live
     lockVersion, drops it locally and syncs the new version; a lost race returns
     { conflict }. DEMO filters it out locally, no network. */
  const removeAsset = useCallback(async (assetId, actingRole) => {
    if (!isDemoEnabled()) {
      const current = stateRef.current;
      const assessmentId = current.activeAssessmentId;
      const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
      try {
        const res = await apiDeleteAsset({ assessmentId, assetId, lockVersion, actingRole });
        setState((cur) => ({
          ...cur,
          assets: cur.assets.filter((asset) => asset.id !== assetId),
          assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion)
        }));
        return { ok: true };
      } catch (error) {
        if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
        return { error: error?.message || "Could not delete this asset." };
      }
    }
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
        /* commentKind ("formal" | "advisory") tags the entry so the
           audit log can distinguish formal review commentary from
           early-stage advisory observations. Defaults to "formal" so
           existing call sites don't change behavior. */
        const commentKind = options.kind === "advisory" ? "advisory" : "formal";
        const entry = {
          id: `au-comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: ts,
          user: options.actor?.name || "Reviewer",
          role: options.actor?.role || "Reviewer",
          facility: assessment?.facilityName || "—",
          assessment: assessment?.name || "—",
          action: "comment",
          commentKind,
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

  const toggleMatrix = useCallback(async (assetId, threatId, actor = null) => {
    return new Promise((resolve) => {
      setState((current) => {
        const key = `${assetId}|${threatId}`;
        const wasTicked = Boolean(current.matrix[key]);
        const next = { ...current.matrix };
        if (wasTicked) {
          delete next[key];
        } else {
          next[key] = true;
        }

        /* Smart cleanup: when unticking, remove any associated empty
           stub evaluation so misclicks don't accumulate orphaned rows.
           If the user has typed anything (or set R1/R2), the row is
           preserved orphaned so re-ticking restores their work. */
        let nextEvaluations = current.evaluations;
        if (wasTicked) {
          const associated = current.evaluations.find(
            (e) => e.assetId === assetId && e.threatId === threatId
          );
          if (associated && !evaluationHasAnyData(associated)) {
            nextEvaluations = current.evaluations.filter((e) => e.id !== associated.id);
          }
        }

        /* Emit an audit entry when the caller provides actor info.
           Always tagged sectionId:5 because the matrix is the
           methodological artifact of Section 5, regardless of which
           UI surface the user clicked. */
        let nextAudit = current.audit;
        if (actor) {
          const asset = current.assets.find((a) => a.id === assetId);
          const threat = current.threats.find((t) => t.id === threatId);
          const assessment = current.assessmentsById[current.activeAssessmentId];
          const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
          nextAudit = [
            {
              id: `au-matrix-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              timestamp: ts,
              user: actor.name || "Unknown",
              role: actor.role || "Author",
              facility: assessment?.facilityName || "—",
              assessment: assessment?.name || "—",
              action: wasTicked ? "matrix-untick" : "matrix-tick",
              detail: `${asset?.name || assetId} × ${
                threat?.short || threat?.classification || threatId
              }`,
              section: "Section 5 — Asset × Threat Matrix",
              sectionId: 5,
              ip: "102.89.34.45"
            },
            ...current.audit
          ];
        }

        queueMicrotask(() => resolve({ ok: true }));
        return {
          ...current,
          matrix: next,
          evaluations: nextEvaluations,
          audit: nextAudit
        };
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

  /* P3 (g) reads — hydrate ONE assessment from the live API in PROD (its
     assessment-level fields + section texts for 1/8, plus the child entities:
     assets/threats/asset×threat links/evaluations), injecting them into state so
     the workspace + all content sections render real data. The child entities
     are workspace-global (single-active-assessment model, §17.7), so they
     replace the top-level assets/threats/links/matrix/evaluations slices — the
     opened assessment owns them. DEMO mode is a no-op (fixtures already present).
     Returns true when hydrated, false on 404 (so the page can redirect). */
  const hydrateAssessmentBundle = useCallback(async (assessmentId, actingRole) => {
    if (isDemoEnabled()) return true;
    try {
      const bundle = await getAssessmentBundle(assessmentId, actingRole);
      const mapped = applySectionTexts(toClientAssessment(bundle.assessment), bundle.sectionTexts || {});
      const { links, matrix } = toClientLinks(bundle.links || []);
      setState((current) => ({
        ...current,
        activeAssessmentId: assessmentId,
        assessmentsById: {
          ...current.assessmentsById,
          [assessmentId]: { ...(current.assessmentsById[assessmentId] || {}), ...mapped }
        },
        assets: (bundle.assets || []).map(toClientAsset),
        threats: (bundle.threats || []).map(toClientThreat),
        evaluations: (bundle.evaluations || []).map(toClientEvaluation),
        links,
        matrix
      }));
      return true;
    } catch (error) {
      if (error?.status === 404) return false;
      throw error;
    }
  }, []);

  /* P3 (g) — save a narrative section (1/8; §2 is a structured form, handled
     separately). The prod↔demo seam: in PROD mode
     it fires the live PUT /sections/:n with the lockVersion the client read,
     updates the local text + lockVersion from the response, and maps a lost
     lock_version race to the exact "modified by another user — reload" copy
     (result.conflict). In DEMO mode it never touches the network — it just
     updates the fixture-backed local state. The section component branches its UI
     on result.conflict. */
  const saveSectionText = useCallback(
    async ({ assessmentId, sectionNumber, contentText, lockVersion, actingRole }) => {
      const field = SECTION_FIELD[sectionNumber];

      const writeLocal = (nextLockVersion) =>
        setState((current) => {
          const assessment = current.assessmentsById[assessmentId];
          if (!assessment) return current;
          return {
            ...current,
            assessmentsById: {
              ...current.assessmentsById,
              [assessmentId]: {
                ...assessment,
                ...(field ? { [field]: contentText } : {}),
                ...(nextLockVersion !== undefined ? { lockVersion: nextLockVersion } : {})
              }
            }
          };
        });

      if (!isDemoEnabled()) {
        try {
          const res = await putSection({ assessmentId, sectionNumber, contentText, lockVersion, actingRole });
          writeLocal(res?.lockVersion);
          return { ok: true, lockVersion: res?.lockVersion };
        } catch (error) {
          if (isConflict(error)) {
            return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
          }
          return { error: error?.message || "Could not save this section." };
        }
      }

      // Demo mode: fixtures only, no network.
      writeLocal();
      return { ok: true };
    },
    []
  );

  const value = useMemo(
    () => ({
      ...state,
      showToast,
      showResultToast,
      dismissToast,
      applyWorkflowTransition,
      applyDemoRoleSwitch,
      appendMitigationLogEntry,
      addComment,
      updateAsset,
      addAsset,
      persistAsset,
      removeAsset,
      acknowledgeAnomaly,
      updateThreat,
      addThreat,
      removeThreat,
      updateMitigation,
      toggleMatrix,
      updateEvaluation,
      upsertEvaluation,
      saveSectionText,
      hydrateAssessmentBundle,
      WORKFLOW_ACTIONS
    }),
    [
      state,
      showToast,
      saveSectionText,
      hydrateAssessmentBundle,
      showResultToast,
      dismissToast,
      applyWorkflowTransition,
      applyDemoRoleSwitch,
      appendMitigationLogEntry,
      addComment,
      updateAsset,
      addAsset,
      persistAsset,
      removeAsset,
      acknowledgeAnomaly,
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
