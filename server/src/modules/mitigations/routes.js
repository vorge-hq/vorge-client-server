const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { transitionMitigation } = require("../../services/mitigationWorkflowService");
const { ROLES } = require("../../services/constants");
const db = require("../../db/knex");
const { appendAuditLog } = require("../../repositories/auditRepository");
const {
  applyMitigationUpdate,
  getMitigationForUser,
  listMine
} = require("../../repositories/mitigationRepository");
const { DomainError } = require("../../services/domainError");

const router = express.Router();

router.use(authenticate);

router.get("/mine", async (req, res, next) => {
  try {
    if (req.actingRole !== ROLES.MITIGATION_OWNER) {
      throw new DomainError("Only Mitigation Owners can view assigned mitigations", 403, "ROLE_NOT_ALLOWED");
    }

    res.json(await listMine({ user: req.user, actingRole: req.actingRole }));
  } catch (error) {
    next(error);
  }
});

router.post("/:mitigationId/log", async (req, res, next) => {
  try {
    const mitigation = await getMitigationForUser({
      mitigationId: req.params.mitigationId,
      user: req.user,
      actingRole: req.actingRole
    });

    if (!mitigation) {
      throw new DomainError("Mitigation not found or outside assignment scope", 404, "MITIGATION_NOT_FOUND");
    }

    const result = transitionMitigation({
      currentStatus: mitigation.status,
      nextStatus: req.body.nextStatus,
      note: req.body.note,
      role: req.actingRole,
      assessmentState: mitigation.assessmentState,
      isAssigned: req.user.id === mitigation.ownerUserId,
      hasFacilityAccess: true
    });

    const progressLog = await db.transaction(async (trx) => {
      const log = await applyMitigationUpdate({
        mitigation,
        transition: result,
        userId: req.user.id,
        note: req.body.note,
        trx
      });

      await appendAuditLog({
        actionType: result.auditAction,
        userId: req.user.id,
        actingRole: req.actingRole,
        facilityId: mitigation.facilityId,
        assessmentId: mitigation.assessmentId,
        entityType: "mitigation",
        entityId: mitigation.id,
        diff: { status: [mitigation.status, result.status] },
        metadata: {
          note: result.note,
          ownerLabel: mitigation.ownerLabel
        },
        traceId: req.traceId
      }, trx);

      return log;
    });

    res.json({
      mitigationId: req.params.mitigationId,
      update: result,
      progressLog
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
