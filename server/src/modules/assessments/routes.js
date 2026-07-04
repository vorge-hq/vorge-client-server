const express = require("express");
const authenticate = require("../../middleware/authenticate");
const facilityScope = require("../../middleware/facilityScope");
const { transitionAssessment, listAllowedWorkflowActions } = require("../../services/assessmentStateMachine");
const { ASSESSMENT_STATES, ROLES } = require("../../services/constants");
const { getAssessmentPermissions, canAccessAssessmentSections } = require("../../services/permissionService");
const { loadExportBundle, getExportFrontMatter } = require("../../repositories/exportRepository");
const { FORMATS } = require("../../services/exportService");
const { activeConn } = require("../../db/requestScope");
const { appendAuditLog } = require("../../repositories/auditRepository");
const {
  createVersionSnapshot,
  getAssessmentBundleForUser,
  getAssessmentForUser,
  listAssessmentsForUser,
  replaceContributors,
  reassignLeadAuthor,
  userHasFacilityRole,
  updateAssessmentState
} = require("../../repositories/assessmentRepository");
const { assignMitigationOwner } = require("../../repositories/mitigationRepository");
const {
  createAssetForAssessment,
  updateAssetInAssessment,
  deleteAssetFromAssessment
} = require("../../repositories/assetRepository");
const {
  createThreatForAssessment,
  updateThreatInAssessment,
  deleteThreatFromAssessment
} = require("../../repositories/threatRepository");
const { setAssetThreatLink } = require("../../repositories/linkRepository");
const { updateEvaluationInAssessment } = require("../../repositories/evaluationRepository");
const { setSectionText } = require("../../repositories/sectionRepository");
const {
  getVocabulary,
  listTagsForEvaluation,
  saveSuggestedTags,
  confirmTags
} = require("../../repositories/tagRepository");
const { runContentMutation, loadWritableAssessment } = require("./contentWriteGuard");
const { rejectMitigationOwner } = require("../../middleware/rejectMitigationOwner");
const { runAiCall, buildPromptContext } = require("../../ai");
const { buildTaggingPrompt, TAG_OUTPUT_SCHEMA } = require("../../ai/prompts/smartTagging");
const { validateTags, normalize: normalizeTag } = require("../../services/tagVocabularyService");
const env = require("../../config/env");
const {
  createAssetSchema,
  updateAssetSchema,
  deleteAssetSchema,
  createThreatSchema,
  updateThreatSchema,
  deleteThreatSchema,
  putLinkSchema,
  updateEvaluationSchema,
  putContributorsSchema,
  putSectionSchema,
  reassignLeadAuthorSchema,
  assignMitigationOwnerSchema,
  suggestTagsSchema,
  getTagsSchema,
  confirmTagsSchema
} = require("./schemas");
const validateRequest = require("../../middleware/validateRequest");
const { DomainError } = require("../../services/domainError");

const router = express.Router();

router.use(authenticate);
router.use(facilityScope);

router.get("/", async (req, res, next) => {
  try {
    const assessments = await listAssessmentsForUser({ user: req.user, actingRole: req.actingRole });
    const visibleAssessments = assessments.filter((assessment) =>
      getAssessmentPermissions({ actingRole: req.actingRole, assessmentState: assessment.state }).canRead
    );

    res.json({ assessments: visibleAssessments });
  } catch (error) {
    next(error);
  }
});

router.get("/:assessmentId", async (req, res, next) => {
  try {
    const bundle = await getAssessmentBundleForUser({
      assessmentId: req.params.assessmentId,
      user: req.user,
      actingRole: req.actingRole
    });

    if (!bundle) {
      throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
    }

    const permissions = getAssessmentPermissions({
      actingRole: req.actingRole,
      assessmentState: bundle.assessment.state
    });

    if (!permissions.canRead) {
      throw new DomainError("The acting role cannot read assessments", 403, "ROLE_NOT_ALLOWED");
    }

    res.json({
      ...bundle,
      permissions,
      allowedWorkflowActions: listAllowedWorkflowActions({
        state: bundle.assessment.state,
        actingRole: req.actingRole
      })
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:assessmentId/workflow", async (req, res, next) => {
  try {
    const assessment = await getAssessmentForUser({
      assessmentId: req.params.assessmentId,
      user: req.user,
      actingRole: req.actingRole
    });

    if (!assessment) {
      throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
    }

    const result = transitionAssessment({
      state: assessment.state,
      actingRole: req.actingRole,
      action: req.body.action,
      reason: req.body.reason
    });

    // Optional optimistic concurrency: if the client sends the lock_version it
    // read (withdraw/recall race), enforce it; a stale value → 409 below.
    const expectedLockVersion = Number.isInteger(req.body.lockVersion) ? req.body.lockVersion : null;

    const updatedAssessment = await activeConn().transaction(async (trx) => {
      const updated = await updateAssessmentState({
        assessmentId: assessment.id,
        fromState: result.from,
        toState: result.to,
        expectedLockVersion,
        trx
      });

      if (!updated) {
        throw new DomainError("Assessment state changed before the workflow action completed", 409, "ASSESSMENT_STATE_CONFLICT");
      }

      await appendAuditLog({
        actionType: result.auditAction,
        userId: req.user.id,
        actingRole: req.actingRole,
        facilityId: assessment.facilityId,
        assessmentId: assessment.id,
        entityType: "assessment",
        entityId: assessment.id,
        diff: { state: [result.from, result.to] },
        metadata: {
          action: result.action,
          reason: result.reason,
          signatureEffects: result.signatureEffects
        },
        traceId: req.traceId
      }, trx);

      if (result.to === ASSESSMENT_STATES.APPROVED) {
        await createVersionSnapshot({ assessmentId: assessment.id, trx });
      }

      return updated;
    });

    res.json({ assessment: updatedAssessment, transition: result });
  } catch (error) {
    next(error);
  }
});

// --- Document export (§16) — GET /export?format=docx|pdf ---------------------
// A read + audited download, NOT a content mutation, so it does not use the
// Author-only write guard: any role that can access the assessment sections may
// export (§16 export rules; Mitigation Owner — no section access — gets 403).
// Approved assessments render the frozen snapshot; non-final states carry a
// watermark (§16.2). The download is logged with the `export` audit vocabulary.
function exportFilename(name) {
  const slug = String(name || "assessment")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "assessment";
  return slug.slice(0, 80);
}

router.get("/:assessmentId/export", async (req, res, next) => {
  try {
    const format = String(req.query.format || "docx").toLowerCase();
    const spec = FORMATS[format];
    if (!spec) {
      throw new DomainError("Unsupported export format", 400, "UNSUPPORTED_EXPORT_FORMAT", {
        supported: Object.keys(FORMATS)
      });
    }

    const assessment = await getAssessmentForUser({
      assessmentId: req.params.assessmentId,
      user: req.user,
      actingRole: req.actingRole
    });
    if (!assessment) {
      throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
    }

    if (!canAccessAssessmentSections({ actingRole: req.actingRole })) {
      throw new DomainError("The acting role cannot export assessments", 403, "ROLE_NOT_ALLOWED");
    }

    const { bundle, isSnapshot } = await loadExportBundle({ assessment });
    const frontMatter = await getExportFrontMatter({ assessment });
    const buffer = await spec.build({ bundle, frontMatter });

    // Log the download BEFORE flushing bytes so a failed audit write fails the
    // export (the row commits with the request under facilityScope's txn).
    await appendAuditLog({
      actionType: "export",
      userId: req.user.id,
      actingRole: req.actingRole,
      facilityId: assessment.facilityId,
      assessmentId: assessment.id,
      entityType: "assessment",
      entityId: assessment.id,
      diff: {},
      metadata: { format, watermarked: !frontMatter.isFinal, frozenSnapshot: isSnapshot },
      traceId: req.traceId
    });

    res.setHeader("Content-Type", spec.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${exportFilename(bundle.assessment.name)}.${spec.extension}"`
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// --- Assets (Section 3) — the P3 reference content endpoints ----------------
// All three flow through runContentMutation, which owns the six-case guards +
// optimistic concurrency + atomic audit. The route body only supplies the
// entity-specific `mutate` closure and shapes the response.

router.post(
  "/:assessmentId/assets",
  validateRequest(createAssetSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ...input } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "asset-created",
        entityType: "asset",
        mutate: (trx, { assessment }) => createAssetForAssessment({ assessment, input, trx })
      });
      res.status(201).json({ asset: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:assessmentId/assets/:assetId",
  validateRequest(updateAssetSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ...input } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "asset-updated",
        entityType: "asset",
        mutate: (trx, { assessment }) =>
          updateAssetInAssessment({ assessment, assetId: req.params.assetId, input, trx })
      });
      res.json({ asset: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:assessmentId/assets/:assetId",
  validateRequest(deleteAssetSchema),
  async (req, res, next) => {
    try {
      const { lockVersion } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "asset-deleted",
        entityType: "asset",
        mutate: (trx, { assessment }) =>
          deleteAssetFromAssessment({ assessment, assetId: req.params.assetId, trx })
      });
      res.json({ ...result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Threats (Section 4) ------------------------------------------------------
router.post(
  "/:assessmentId/threats",
  validateRequest(createThreatSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ...input } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "threat-created",
        entityType: "threat",
        mutate: (trx, { assessment }) => createThreatForAssessment({ assessment, input, trx })
      });
      res.status(201).json({ threat: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:assessmentId/threats/:threatId",
  validateRequest(updateThreatSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ...input } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "threat-updated",
        entityType: "threat",
        mutate: (trx, { assessment }) =>
          updateThreatInAssessment({ assessment, threatId: req.params.threatId, input, trx })
      });
      res.json({ threat: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:assessmentId/threats/:threatId",
  validateRequest(deleteThreatSchema),
  async (req, res, next) => {
    try {
      const { lockVersion } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "threat-deleted",
        entityType: "threat",
        mutate: (trx, { assessment }) =>
          deleteThreatFromAssessment({ assessment, threatId: req.params.threatId, trx })
      });
      res.json({ ...result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Asset×threat links (Section 5) — PUT enable/disable ----------------------
router.put(
  "/:assessmentId/links/:assetId/:threatId",
  validateRequest(putLinkSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, enabled } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "link-updated",
        entityType: "asset_threat_link",
        mutate: (trx, { assessment }) =>
          setAssetThreatLink({
            assessment,
            assetId: req.params.assetId,
            threatId: req.params.threatId,
            enabled,
            trx
          })
      });
      // `result` = { link, evaluation }: enabling a pair also seeds/returns its
      // evaluation so the client has a real (UUID) row to edit in Section 6.
      res.json({ link: result.link, evaluation: result.evaluation, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Evaluations (Section 6) — PATCH ------------------------------------------
router.patch(
  "/:assessmentId/evaluations/:evaluationId",
  validateRequest(updateEvaluationSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ...input } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "evaluation-updated",
        entityType: "evaluation",
        mutate: (trx, { assessment }) =>
          updateEvaluationInAssessment({ assessment, evaluationId: req.params.evaluationId, input, trx })
      });
      res.json({ evaluation: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Smart tagging (Section 6, §9.6) — AI suggest + Author confirm ------------
// These share the content role/state gate (Author + Draft) via
// loadWritableAssessment but do NOT bump lock_version: tags are advisory
// metadata that fire AFTER the client's scenario save, so touching lock_version
// would 409 the Author's next content write. rejectMitigationOwner is mounted on
// the AI endpoint for the "Mitigation Owner × every AI endpoint → 403" matrix
// (the Author check would 403 them anyway, but the shared guard makes it hold by
// construction). §9.7 audit: the suggested set and the confirmed set are written
// as SEPARATE rows (ai-tags-suggested, tags-confirmed).

// Load the evaluation the tags hang off, scoped to the (already facility-scoped)
// assessment. Returns null → 404 without leaking whether the id exists elsewhere.
async function loadEvaluationForTags({ assessment, evaluationId }) {
  const row = await activeConn()("evaluations")
    .where({ id: evaluationId, assessment_id: assessment.id })
    .first();
  return row || null;
}

router.post(
  "/:assessmentId/evaluations/:evaluationId/suggest-tags",
  rejectMitigationOwner,
  validateRequest(suggestTagsSchema),
  async (req, res, next) => {
    try {
      if (!env.aiEnabled) {
        throw new DomainError("Smart tagging is not enabled", 404, "AI_FEATURE_DISABLED");
      }
      const assessment = await loadWritableAssessment({ req, assessmentId: req.params.assessmentId });
      const evaluation = await loadEvaluationForTags({ assessment, evaluationId: req.params.evaluationId });
      if (!evaluation) {
        throw new DomainError("Evaluation not found in this assessment", 404, "EVALUATION_NOT_FOUND");
      }

      // Facility-scope invariant by construction: the evaluation must belong to
      // the request's facility, else buildPromptContext throws (never a bleed).
      buildPromptContext({ facilityId: assessment.facilityId, entities: [evaluation] });

      const vocabulary = await getVocabulary({ facilityId: assessment.facilityId });
      const { output } = await runAiCall({
        feature: "smart_tagging",
        kind: "object",
        facilityId: assessment.facilityId,
        userId: req.user.id,
        actingRole: req.actingRole,
        traceId: req.traceId,
        schema: TAG_OUTPUT_SCHEMA,
        prompt: buildTaggingPrompt({ scenario: evaluation.scenario, vocabulary })
      });

      // Out-of-vocabulary tags are DISCARDED here (§9.6) — only canonical
      // {category, value} pairs the facility actually defines are persisted.
      const validTags = validateTags({ vocabulary, tags: output && output.tags });

      const tags = await activeConn().transaction(async (trx) => {
        const persisted = await saveSuggestedTags({
          facilityId: assessment.facilityId,
          evaluationId: evaluation.id,
          tags: validTags,
          trx
        });
        await appendAuditLog(
          {
            actionType: "ai-tags-suggested",
            userId: req.user.id,
            actingRole: req.actingRole,
            facilityId: assessment.facilityId,
            assessmentId: assessment.id,
            entityType: "evaluation",
            entityId: evaluation.id,
            diff: null,
            metadata: { tags: persisted.map((t) => ({ category: t.category, value: t.value })) },
            traceId: req.traceId
          },
          trx
        );
        return persisted;
      });

      res.json({ tags });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:assessmentId/evaluations/:evaluationId/tags",
  validateRequest(getTagsSchema),
  async (req, res, next) => {
    try {
      const assessment = await getAssessmentForUser({
        assessmentId: req.params.assessmentId,
        user: req.user,
        actingRole: req.actingRole
      });
      if (!assessment) {
        throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
      }
      // Bind the evaluation to THIS assessment (same invariant the write paths
      // enforce) so a tag read can't reach another assessment's evaluation in
      // the same facility via a mismatched URL.
      const evaluation = await loadEvaluationForTags({ assessment, evaluationId: req.params.evaluationId });
      if (!evaluation) {
        throw new DomainError("Evaluation not found in this assessment", 404, "EVALUATION_NOT_FOUND");
      }
      const tags = await listTagsForEvaluation({
        facilityId: assessment.facilityId,
        evaluationId: evaluation.id
      });
      res.json({ tags });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:assessmentId/evaluations/:evaluationId/tags/confirm",
  rejectMitigationOwner,
  validateRequest(confirmTagsSchema),
  async (req, res, next) => {
    try {
      const assessment = await loadWritableAssessment({ req, assessmentId: req.params.assessmentId });
      const evaluation = await loadEvaluationForTags({ assessment, evaluationId: req.params.evaluationId });
      if (!evaluation) {
        throw new DomainError("Evaluation not found in this assessment", 404, "EVALUATION_NOT_FOUND");
      }

      // Re-validate every submitted value against the facility vocabulary — the
      // client cannot confirm a tag outside the dictionary even by hand. Sources
      // are preserved so the audit distinguishes AI-kept from manually-added.
      const vocabulary = await getVocabulary({ facilityId: assessment.facilityId });
      // validateTags matches by normalized VALUE (ignoring the submitted
      // category, which it replaces with the canonical one), so the source map
      // must key on the same normalized value — else a mis-categorized or
      // whitespace-padded submission would lose its "ai" source and be audited
      // as manual (§9.6 must distinguish AI-kept from manually-added).
      const sourceByValue = new Map(
        (req.validated.body.tags || []).map((t) => [normalizeTag(t.value), t.source])
      );
      const validated = validateTags({
        vocabulary,
        tags: (req.validated.body.tags || []).map((t) => t.value)
      }).map((t) => ({ ...t, source: sourceByValue.get(normalizeTag(t.value)) === "ai" ? "ai" : "manual" }));

      const tags = await activeConn().transaction(async (trx) => {
        const confirmed = await confirmTags({
          facilityId: assessment.facilityId,
          evaluationId: evaluation.id,
          tags: validated,
          trx
        });
        await appendAuditLog(
          {
            actionType: "tags-confirmed",
            userId: req.user.id,
            actingRole: req.actingRole,
            facilityId: assessment.facilityId,
            assessmentId: assessment.id,
            entityType: "evaluation",
            entityId: evaluation.id,
            diff: null,
            metadata: { tags: confirmed.map((t) => ({ category: t.category, value: t.value, source: t.source })) },
            traceId: req.traceId
          },
          trx
        );
        return confirmed;
      });

      res.json({ tags });
    } catch (error) {
      next(error);
    }
  }
);

// --- Contributors (Section 9.A) — PUT replaces the list -----------------------
router.put(
  "/:assessmentId/contributors",
  validateRequest(putContributorsSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, contributors } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "contributors-updated",
        entityType: "assessment",
        mutate: (trx, { assessment }) => replaceContributors({ assessment, contributors, trx })
      });
      res.json({ contributors: result.contributors, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Section text (Sections 1/2/8) — PUT /sections/:n -------------------------
router.put(
  "/:assessmentId/sections/:n",
  validateRequest(putSectionSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, contentText } = req.validated.body;
      const sectionNumber = req.validated.params.n;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "section-text-updated",
        entityType: "assessment_section",
        mutate: (trx, { assessment }) => setSectionText({ assessment, sectionNumber, contentText, trx })
      });
      res.json({ section: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

// --- Lead Author reassignment (§5.5) — PUT /lead-author ----------------------
// Not a standard content write: the actor may be the current Lead Author OR an
// Admin, and it is allowed in any non-Approved state (Draft/In Review). So it
// uses its own guard chain but the same lock_version + atomic-audit machinery.
router.put(
  "/:assessmentId/lead-author",
  validateRequest(reassignLeadAuthorSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, leadAuthorUserId, reason } = req.validated.body;
      const assessment = await getAssessmentForUser({
        assessmentId: req.params.assessmentId,
        user: req.user,
        actingRole: req.actingRole
      });
      if (!assessment) {
        throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
      }

      if (assessment.state === ASSESSMENT_STATES.APPROVED) {
        throw new DomainError("An approved assessment cannot be reassigned", 409, "INVALID_ASSESSMENT_STATE", {
          actualState: assessment.state
        });
      }

      // Actor must be the current Lead Author or an Admin (§5.5).
      const isLeadAuthor = req.actingRole === ROLES.AUTHOR && assessment.leadAuthorUserId === req.user.id;
      const isAdmin = req.actingRole === ROLES.ADMIN;
      if (!isLeadAuthor && !isAdmin) {
        throw new DomainError("Only the current Lead Author or an Admin can reassign", 403, "ROLE_NOT_ALLOWED");
      }

      const result = await activeConn().transaction(async (trx) => {
        // Defensive validation (§5.5): the target must currently hold Author
        // rights at this facility.
        const targetIsAuthor = await userHasFacilityRole({
          userId: leadAuthorUserId,
          facilityId: assessment.facilityId,
          role: ROLES.AUTHOR,
          trx
        });
        if (!targetIsAuthor) {
          throw new DomainError("Target user is not an Author at this facility", 422, "TARGET_NOT_AUTHOR");
        }

        const bumped = await trx("assessments")
          .where({ id: assessment.id, lock_version: lockVersion })
          .update({ lock_version: trx.raw("lock_version + 1"), updated_at: trx.fn.now() })
          .returning(["lock_version"]);
        if (bumped.length === 0) {
          throw new DomainError("The assessment was modified by another user — reload and retry", 409, "LOCK_VERSION_CONFLICT");
        }

        const handover = await reassignLeadAuthor({ assessment, newLeadAuthorUserId: leadAuthorUserId, trx });
        await appendAuditLog(
          {
            actionType: "assessment.lead_author_reassigned",
            userId: req.user.id,
            actingRole: req.actingRole,
            facilityId: assessment.facilityId,
            assessmentId: assessment.id,
            entityType: "assessment",
            entityId: assessment.id,
            diff: { leadAuthorUserId: [handover.previous, handover.next] },
            metadata: { reason: reason || null },
            traceId: req.traceId
          },
          trx
        );
        return { leadAuthorUserId: handover.next, lockVersion: Number(bumped[0].lock_version) };
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// --- Mitigation owner assignment (§7) — PUT /mitigations/:id/owner ------------
router.put(
  "/:assessmentId/mitigations/:mitigationId/owner",
  validateRequest(assignMitigationOwnerSchema),
  async (req, res, next) => {
    try {
      const { lockVersion, ownerUserId, ownerRoleLabel } = req.validated.body;
      const { result, lockVersion: newLockVersion } = await runContentMutation({
        req,
        assessmentId: req.params.assessmentId,
        expectedLockVersion: lockVersion,
        actionType: "mitigation-owner-assigned",
        entityType: "mitigation",
        mutate: (trx, { assessment }) =>
          assignMitigationOwner({
            assessment,
            mitigationId: req.params.mitigationId,
            ownerUserId,
            ownerRoleLabel,
            trx
          })
      });
      res.json({ mitigation: result, lockVersion: newLockVersion });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
