const express = require("express");
const authenticate = require("../../middleware/authenticate");
const facilityScope = require("../../middleware/facilityScope");
const { transitionAssessment, listAllowedWorkflowActions } = require("../../services/assessmentStateMachine");
const { ASSESSMENT_STATES, ROLES } = require("../../services/constants");
const { getAssessmentPermissions } = require("../../services/permissionService");
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
const { runContentMutation } = require("./contentWriteGuard");
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
  assignMitigationOwnerSchema
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
      res.json({ link: result, lockVersion: newLockVersion });
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
