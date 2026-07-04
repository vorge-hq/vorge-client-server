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
import { LIBRARY_SCENARIOS, similarity } from "../../data/library";
import { validateMitigationUpdate } from "../mitigationOwner/mitigationRules";
import { evaluationHasAnyData } from "./assessmentModel";
import { isDemoEnabled } from "../../auth/demoFlag";
import {
  putSection,
  listAssessments,
  getAssessmentBundle,
  isConflict,
  CONFLICT_RELOAD_MESSAGE,
  createAsset as apiCreateAsset,
  updateAsset as apiUpdateAsset,
  deleteAsset as apiDeleteAsset,
  createThreat as apiCreateThreat,
  updateThreat as apiUpdateThreat,
  deleteThreat as apiDeleteThreat,
  putLink as apiPutLink,
  updateEvaluation as apiUpdateEvaluation,
  putContributors as apiPutContributors,
  exportAssessment as apiExportAssessment,
  searchLibrary as apiSearchLibrary,
  suggestTags as apiSuggestTags,
  getTags as apiGetTags,
  confirmTags as apiConfirmTags
} from "../../api/assessmentApi";
import { triggerBrowserDownload } from "../../api/download";
import {
  toClientAssessment,
  applySectionTexts,
  toClientAsset,
  toClientThreat,
  toClientEvaluation,
  toClientLinks,
  toServerAssetPayload,
  toServerThreatPayload,
  toServerEvaluationPayload,
  toLibraryPickerEntry
} from "../../api/adapters";
import {
  WORKFLOW_ACTIONS,
  applyWorkflowAction,
  getInitialAssessmentState
} from "./workflowReducer";

const WorkspaceContext = createContext(null);

// Narrative section number → the assessment field that holds its text.
const SECTION_FIELD = Object.freeze({ 1: "executiveSummary", 2: "facilityInfo", 8: "conclusion" });

// Demo-mode smart-tag suggestions (§9.6): a canned "AI-suggested" set so the
// chips UI is visible in the showcase without a gateway call.
const DEMO_SUGGESTED_TAGS = Object.freeze([
  { category: "threat_type", value: "Insider", source: "ai", status: "suggested" },
  { category: "consequence_category", value: "People", source: "ai", status: "suggested" }
]);

// Server-assigned ids are UUIDs; client-created stub ids are not. Used to tell a
// persistable (server-backed) row from a client-only stub — see persistEvaluation.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /* P3 (g) — add a threat. Mirrors addAsset: PROD POSTs, maps the server row
     back, appends, syncs lockVersion; DEMO appends the fixture. Returns
     { ok, threat } so the caller can expand the created row by its id. */
  const addThreat = useCallback(async (threat, actingRole) => {
    if (!isDemoEnabled()) {
      const current = stateRef.current;
      const assessmentId = current.activeAssessmentId;
      const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
      try {
        const res = await apiCreateThreat({ assessmentId, lockVersion, actingRole, ...toServerThreatPayload(threat) });
        const created = toClientThreat(res.threat);
        setState((cur) => ({
          ...cur,
          threats: [...cur.threats, created],
          assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion)
        }));
        return { ok: true, threat: created };
      } catch (error) {
        if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
        return { error: error?.message || "Could not add this threat." };
      }
    }
    return new Promise((resolve) => {
      setState((current) => {
        queueMicrotask(() => resolve({ ok: true, threat }));
        return { ...current, threats: [...current.threats, threat] };
      });
    });
  }, []);

  /* P3 (g) — persist a threat's fields on blur (updateThreat above keeps local
     state optimistic per keystroke). PROD PATCHes the current value (+ overrides
     for the discrete rating toggle); DEMO is a no-op. */
  const persistThreat = useCallback(async (threatId, actingRole, overrides = {}) => {
    if (isDemoEnabled()) return { ok: true };
    const current = stateRef.current;
    const assessmentId = current.activeAssessmentId;
    const existing = current.threats.find((t) => t.id === threatId);
    if (!existing) return { ok: true };
    const threat = { ...existing, ...overrides };
    const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
    try {
      const res = await apiUpdateThreat({ assessmentId, threatId, lockVersion, actingRole, ...toServerThreatPayload(threat) });
      setState((cur) => ({ ...cur, assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion) }));
      return { ok: true };
    } catch (error) {
      if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
      return { error: error?.message || "Could not save this threat." };
    }
  }, []);

  /* P3 (g) — remove a threat. PROD DELETEs (the server cascades its links); DEMO
     also prunes any matrix ticks referencing it. Both sync/return as the others. */
  const removeThreat = useCallback(async (threatId, actingRole) => {
    if (!isDemoEnabled()) {
      const current = stateRef.current;
      const assessmentId = current.activeAssessmentId;
      const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
      try {
        const res = await apiDeleteThreat({ assessmentId, threatId, lockVersion, actingRole });
        setState((cur) => ({
          ...cur,
          threats: cur.threats.filter((threat) => threat.id !== threatId),
          matrix: Object.fromEntries(
            Object.entries(cur.matrix).filter(([key]) => !key.endsWith(`|${threatId}`))
          ),
          links: cur.links.filter((link) => link.threatId !== threatId),
          assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion)
        }));
        return { ok: true };
      } catch (error) {
        if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
        return { error: error?.message || "Could not delete this threat." };
      }
    }
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

  /* P3 (g) — toggle an asset×threat link (Section 5). PROD fires PUT
     /links/:assetId/:threatId with enabled = !wasTicked and the live lockVersion,
     then reflects it in matrix + links and syncs the version; a lost race returns
     { conflict }. The server owns the audit entry, and evaluation rows aren't
     pruned client-side (the server is authoritative). DEMO keeps the local
     behaviour below (audit entry + empty-stub-evaluation cleanup). actingRole is
     taken from the actor the Section-5 UI already passes. */
  const toggleMatrix = useCallback(async (assetId, threatId, actor = null) => {
    if (!isDemoEnabled()) {
      const current = stateRef.current;
      const assessmentId = current.activeAssessmentId;
      const key = `${assetId}|${threatId}`;
      const enabled = !current.matrix[key];
      const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
      try {
        const res = await apiPutLink({ assessmentId, assetId, threatId, enabled, lockVersion, actingRole: actor?.role });
        setState((cur) => {
          const nextMatrix = { ...cur.matrix };
          if (enabled) nextMatrix[key] = true;
          else delete nextMatrix[key];
          const nextLinks = enabled
            ? [...cur.links.filter((l) => !(l.assetId === assetId && l.threatId === threatId)), { assetId, threatId }]
            : cur.links.filter((l) => !(l.assetId === assetId && l.threatId === threatId));
          // Enabling seeds a server evaluation (real UUID) — add it if we don't
          // already have one for this pair, so Section 6 can PATCH it.
          let nextEvaluations = cur.evaluations;
          if (enabled && res?.evaluation && !cur.evaluations.some((e) => e.assetId === assetId && e.threatId === threatId)) {
            nextEvaluations = [...cur.evaluations, toClientEvaluation(res.evaluation)];
          }
          return {
            ...cur,
            matrix: nextMatrix,
            links: nextLinks,
            evaluations: nextEvaluations,
            assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion)
          };
        });
        return { ok: true };
      } catch (error) {
        if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
        return { error: error?.message || "Could not update this link." };
      }
    }
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

  /* P3 (g) — persist an evaluation's fields on blur (upsertEvaluation above keeps
     local state optimistic per keystroke). PROD PATCHes the current value (+
     overrides for discrete risk-block selects); DEMO is a no-op.

     KNOWN SERVER GAP: evaluations have only a PATCH endpoint — there is no create
     path (enabling a link does NOT seed an evaluation row). So a client-created
     stub (non-UUID id, made by ticking a fresh cell) has no server row to PATCH;
     we skip the doomed call and keep it local. Persisting NEW evaluations in prod
     needs a server create endpoint (or auto-create on link-enable) — tracked as a
     P3 follow-on. Editing EXISTING (seeded/bundle) evaluations works today. */
  const persistEvaluation = useCallback(async (evaluationId, actingRole, overrides = {}) => {
    if (isDemoEnabled()) return { ok: true };
    if (!UUID_RE.test(evaluationId || "")) return { ok: true, skipped: true };
    const current = stateRef.current;
    const assessmentId = current.activeAssessmentId;
    const existing = current.evaluations.find((e) => e.id === evaluationId);
    if (!existing) return { ok: true };
    const evaluation = { ...existing, ...overrides };
    const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
    try {
      const res = await apiUpdateEvaluation({ assessmentId, evaluationId, lockVersion, actingRole, ...toServerEvaluationPayload(evaluation) });
      setState((cur) => ({ ...cur, assessmentsById: syncLockVersion(cur, assessmentId, res?.lockVersion) }));
      return { ok: true };
    } catch (error) {
      if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
      return { error: error?.message || "Could not save this evaluation." };
    }
  }, []);

  /* P3 (g) — replace the contributors list (Section 9.A). PROD PUTs the whole
     list with the live lockVersion, then stores the server-echoed list + new
     version onto the active assessment; a lost race returns { conflict }. DEMO is
     a no-op (the card's local state is the truth). */
  const saveContributors = useCallback(async (contributors, actingRole) => {
    if (isDemoEnabled()) return { ok: true };
    const current = stateRef.current;
    const assessmentId = current.activeAssessmentId;
    const lockVersion = current.assessmentsById[assessmentId]?.lockVersion ?? 1;
    try {
      const res = await apiPutContributors({ assessmentId, contributors, lockVersion, actingRole });
      setState((cur) => {
        const assessment = cur.assessmentsById[assessmentId];
        if (!assessment) return cur;
        return {
          ...cur,
          assessmentsById: {
            ...cur.assessmentsById,
            [assessmentId]: {
              ...assessment,
              contributors: res?.contributors ?? contributors,
              ...(res?.lockVersion !== undefined ? { lockVersion: res.lockVersion } : {})
            }
          }
        };
      });
      return { ok: true };
    } catch (error) {
      if (isConflict(error)) return { error: CONFLICT_RELOAD_MESSAGE, conflict: true };
      return { error: error?.message || "Could not save contributors." };
    }
  }, []);

  /* P3 (g) reads — hydrate ONE assessment from the live API in PROD (its
     assessment-level fields + section texts for 1/8, plus the child entities:
     assets/threats/asset×threat links/evaluations), injecting them into state so
     the workspace + all content sections render real data. The child entities
     are workspace-global (single-active-assessment model, §17.7), so they
     replace the top-level assets/threats/links/matrix/evaluations slices — the
     opened assessment owns them. DEMO mode is a no-op (fixtures already present).
     Returns true when hydrated, false on 404 (so the page can redirect). */
  /* Prod dashboard hydration: the dashboards render from the in-memory
     `assessmentsById` store, which is fixture-seeded. In prod those fixtures
     carry demo facility/author ids that never match the real session, so every
     dashboard filters to empty. This fetches the server-scoped list once (on
     entry to the app shell) and REPLACES the store with the real assessments so
     every dashboard reflects live data. DEMO keeps its fixtures (no fetch). */
  const hydrateAssessmentsList = useCallback(async (actingRole) => {
    if (isDemoEnabled()) return true;
    try {
      const { assessments = [] } = await listAssessments(actingRole);
      const mapped = assessments.map((server) => {
        const client = toClientAssessment(server);
        return { ...client, ...getInitialAssessmentState(client) };
      });
      setState((current) => {
        const assessmentsById = {};
        mapped.forEach((a) => {
          assessmentsById[a.id] = { ...(current.assessmentsById[a.id] || {}), ...a };
        });
        // Keep the active id if it survived the replace; otherwise point it at
        // the first real assessment so "Active SRA" surfaces resolve.
        const activeAssessmentId = assessmentsById[current.activeAssessmentId]
          ? current.activeAssessmentId
          : mapped[0]?.id ?? current.activeAssessmentId;
        return { ...current, assessmentsById, activeAssessmentId };
      });
      return true;
    } catch {
      return false;
    }
  }, []);

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

  /* P3.5 — document export (§16). PROD downloads the rendered .docx/.pdf for the
     active assessment (server enforces role + frozen-snapshot + watermark + audit)
     and streams it to the browser. DEMO fires NO network — fixtures have no real
     document to render — and signals { demo: true } so the caller can explain. */
  const exportDocument = useCallback(async (format, actingRole) => {
    if (isDemoEnabled()) {
      return { ok: false, demo: true };
    }
    const assessmentId = stateRef.current.activeAssessmentId;
    try {
      const { blob, filename } = await apiExportAssessment({ assessmentId, format, actingRole });
      triggerBrowserDownload(blob, filename);
      return { ok: true };
    } catch (error) {
      return { error: error?.message || "Could not export this document." };
    }
  }, []);

  /* Library semantic search — the prod↔demo seam for the LibraryModal picker.
     DEMO: rank the local scenario fixtures with the fixture `similarity` (no
     fetch), preserving the modal's original behavior. PROD: embed + cosine-rank
     server-side via GET /api/library/search, scoped to the active assessment's
     facility, and map results into the picker shape. Returns [{ entry, score }]
     either way. Empty query → the unranked fixture list (demo) or [] (prod). */
  const searchLibrary = useCallback(async (query, actingRole) => {
    const q = (query || "").trim();
    if (isDemoEnabled()) {
      const scenarios = stateRef.current.libraryScenarios || [];
      if (!q) {
        return scenarios.map((entry) => ({ entry, score: 0 }));
      }
      return scenarios
        .map((entry) => ({ entry, score: similarity(q, entry.text) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }
    if (!q) {
      return [];
    }
    const current = stateRef.current;
    const assessment = current.assessmentsById[current.activeAssessmentId];
    const facilityId = assessment?.facilityId;
    if (!facilityId) {
      return [];
    }
    const { entries } = await apiSearchLibrary({ facilityId, q, type: "Scenarios", actingRole });
    return (entries || []).map((server) => {
      const entry = toLibraryPickerEntry(server);
      return { entry, score: entry.similarity ?? 0 };
    });
  }, []);

  /* Smart tagging (§9.6) — the prod↔demo seam for the Section-6 scenario chips.
     Tags never bump lockVersion (advisory metadata that fires after the save),
     so these carry none. DEMO: no fetch — suggest returns a canned AI set,
     confirm/load echo locally. PROD: hit the evaluation-scoped tag endpoints,
     scoped to the active assessment. All three resolve to a tag array. */
  const activeAssessmentIdRef = () => stateRef.current.activeAssessmentId;

  const loadScenarioTags = useCallback(async (evaluationId, actingRole) => {
    if (isDemoEnabled()) return [];
    const assessmentId = activeAssessmentIdRef();
    if (!assessmentId) return [];
    const { tags } = await apiGetTags({ assessmentId, evaluationId, actingRole });
    return tags || [];
  }, []);

  const suggestScenarioTags = useCallback(async (evaluationId, actingRole) => {
    if (isDemoEnabled()) {
      return DEMO_SUGGESTED_TAGS.map((t) => ({ ...t }));
    }
    const assessmentId = activeAssessmentIdRef();
    if (!assessmentId) return [];
    const { tags } = await apiSuggestTags({ assessmentId, evaluationId, actingRole });
    return tags || [];
  }, []);

  const confirmScenarioTags = useCallback(async (evaluationId, tags, actingRole) => {
    const chosen = (tags || []).map((t) => ({ category: t.category, value: t.value, source: t.source }));
    if (isDemoEnabled()) {
      return { ok: true, tags: chosen.map((t) => ({ ...t, status: "confirmed" })) };
    }
    const assessmentId = activeAssessmentIdRef();
    // No active assessment → don't fire a malformed /assessments/undefined URL;
    // signal a no-op the caller can ignore without wiping the working set.
    if (!assessmentId) return { ok: false, tags: null };
    const { tags: confirmed } = await apiConfirmTags({ assessmentId, evaluationId, tags: chosen, actingRole });
    return { ok: true, tags: confirmed || [] };
  }, []);

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
      persistThreat,
      removeThreat,
      updateMitigation,
      toggleMatrix,
      updateEvaluation,
      upsertEvaluation,
      persistEvaluation,
      saveContributors,
      saveSectionText,
      hydrateAssessmentBundle,
      hydrateAssessmentsList,
      exportDocument,
      searchLibrary,
      loadScenarioTags,
      suggestScenarioTags,
      confirmScenarioTags,
      WORKFLOW_ACTIONS
    }),
    [
      state,
      showToast,
      saveSectionText,
      hydrateAssessmentBundle,
      hydrateAssessmentsList,
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
      persistThreat,
      removeThreat,
      updateMitigation,
      toggleMatrix,
      updateEvaluation,
      upsertEvaluation,
      persistEvaluation,
      saveContributors,
      exportDocument,
      searchLibrary,
      loadScenarioTags,
      suggestScenarioTags,
      confirmScenarioTags
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
