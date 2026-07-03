const express = require("express");
const authenticate = require("../../middleware/authenticate");
const facilityScope = require("../../middleware/facilityScope");
const { transitionAssessment, listAllowedWorkflowActions } = require("../../services/assessmentStateMachine");
const { ASSESSMENT_STATES } = require("../../services/constants");
const { getAssessmentPermissions } = require("../../services/permissionService");
const { activeConn } = require("../../db/requestScope");
const { appendAuditLog } = require("../../repositories/auditRepository");
const {
  createVersionSnapshot,
  getAssessmentBundleForUser,
  getAssessmentForUser,
  listAssessmentsForUser,
  updateAssessmentState
} = require("../../repositories/assessmentRepository");
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

    const updatedAssessment = await activeConn().transaction(async (trx) => {
      const updated = await updateAssessmentState({
        assessmentId: assessment.id,
        fromState: result.from,
        toState: result.to,
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

module.exports = router;
