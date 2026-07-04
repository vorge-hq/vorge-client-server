// P3 · (b) — the shared content write-guard. EVERY content mutation (assets,
// threats, links, evaluations, contributors, section text) flows through here,
// so the six-case ground rules + optimistic concurrency + atomic audit live and
// are tested in exactly ONE place. Each endpoint becomes a thin caller that
// only supplies its `mutate` closure.
//
// Guard order is deliberate and asserted by tests (do not reorder):
//   1. assessment out of facility scope -> 404 ASSESSMENT_NOT_FOUND (no leak)
//   2. acting role is not Author        -> 403 ROLE_NOT_ALLOWED
//   3. assessment not in Draft          -> 409 INVALID_ASSESSMENT_STATE
//   4. lock_version stale / lost a race -> 409 LOCK_VERSION_CONFLICT
// A missing lockVersion in the body is a 400 VALIDATION_ERROR rejected earlier
// by the route's Zod schema — it never reaches here (never a silent
// last-write-wins).
//
// Atomicity: the lock_version bump, the caller's mutation, and the audit row all
// run inside one activeConn().transaction — a savepoint on the request's
// RLS-scoped connection. Any failure (including a forced audit-insert failure)
// rolls the whole write back. The bump runs FIRST so its row lock serialises
// concurrent writers: the loser blocks until the winner commits, then matches 0
// rows and gets the 409 (true race -> exactly one 200 + one 409).
const { activeConn } = require("../../db/requestScope");
// Imported as a namespace (not destructured) so the atomicity test can
// jest.spyOn(auditRepository, "appendAuditLog") and force the insert to reject.
const auditRepository = require("../../repositories/auditRepository");
const { getAssessmentForUser } = require("../../repositories/assessmentRepository");
const { ROLES, ASSESSMENT_STATES } = require("../../services/constants");
const { DomainError } = require("../../services/domainError");

// Guard steps 1–3 (scope 404 → Author 403 → Draft 409), factored out so the
// smart-tagging endpoints (O4) can reuse the SAME role/state gate without the
// lock_version bump: a tag suggestion is advisory metadata, not lock-versioned
// content, and must not force the Author's next content save into a 409. Returns
// the loaded, writable assessment. Both this and runContentMutation stay the one
// place those three rules live.
async function loadWritableAssessment({ req, assessmentId }) {
  const { user, actingRole } = req;

  const assessment = await getAssessmentForUser({ assessmentId, user, actingRole });
  if (!assessment) {
    throw new DomainError("Assessment not found or outside facility scope", 404, "ASSESSMENT_NOT_FOUND");
  }

  if (actingRole !== ROLES.AUTHOR) {
    throw new DomainError("Only the Author can edit assessment content", 403, "ROLE_NOT_ALLOWED", {
      requiredRole: ROLES.AUTHOR,
      actualRole: actingRole
    });
  }

  if (assessment.state !== ASSESSMENT_STATES.DRAFT) {
    throw new DomainError(
      `Content can only be edited while the assessment is ${ASSESSMENT_STATES.DRAFT}`,
      409,
      "INVALID_ASSESSMENT_STATE",
      { expectedState: ASSESSMENT_STATES.DRAFT, actualState: assessment.state }
    );
  }

  return assessment;
}

async function runContentMutation({
  req,
  assessmentId,
  expectedLockVersion,
  actionType,
  entityType,
  // mutate: async (trx, { assessment }) => ({ entityId, diff, metadata?, result })
  //   `diff` is the before/after of changed fields only ([before, after] pairs).
  //   `result` is whatever the route wants to return to the client.
  mutate
}) {
  const { user, actingRole } = req;

  const assessment = await loadWritableAssessment({ req, assessmentId });

  return activeConn().transaction(async (trx) => {
    const bumped = await trx("assessments")
      .where({ id: assessment.id, lock_version: expectedLockVersion })
      .update({ lock_version: trx.raw("lock_version + 1"), updated_at: trx.fn.now() })
      .returning(["lock_version"]);

    if (bumped.length === 0) {
      throw new DomainError(
        "The assessment was modified by another user — reload and retry",
        409,
        "LOCK_VERSION_CONFLICT",
        { expectedLockVersion }
      );
    }

    const newLockVersion = Number(bumped[0].lock_version);

    const { entityId, diff, metadata = {}, result } = await mutate(trx, { assessment });

    await auditRepository.appendAuditLog(
      {
        actionType,
        userId: user.id,
        actingRole,
        facilityId: assessment.facilityId,
        assessmentId: assessment.id,
        entityType,
        entityId: entityId || assessment.id,
        diff,
        metadata,
        traceId: req.traceId
      },
      trx
    );

    return { result, lockVersion: newLockVersion, assessmentId: assessment.id };
  });
}

module.exports = { runContentMutation, loadWritableAssessment };
