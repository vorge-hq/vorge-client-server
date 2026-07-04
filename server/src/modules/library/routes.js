// P4 · O1 — Library management CRUD (/api/library). A facility-scoped DATA
// module: authenticate + facilityScope (RLS) at the router level, then per route
// requireFacilityAccess checks the requested facilityId is within the acting
// role's scope. Reads are open to any facility role; writes are Admin-only
// (authorizeRole(ADMIN)). Every mutation writes one hyphen-vocabulary audit row
// (library-entry-created|updated|deleted) atomically with the change.
const express = require("express");
const authenticate = require("../../middleware/authenticate");
const facilityScope = require("../../middleware/facilityScope");
const authorizeRole = require("../../middleware/authorizeRole");
const requireFacilityAccess = require("../../middleware/requireFacilityAccess");
const validateRequest = require("../../middleware/validateRequest");
const { ROLES } = require("../../services/constants");
const env = require("../../config/env");
const db = require("../../db/knex");
const { activeConn } = require("../../db/requestScope");
const { appendAuditLog } = require("../../repositories/auditRepository");
const { DomainError } = require("../../services/domainError");
const {
  listLibraryEntries,
  getLibraryEntry,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  searchByEmbedding
} = require("../../repositories/libraryRepository");
const { runAiCall } = require("../../ai");
const { scheduleEmbedding } = require("../../ai/libraryEmbedding");
const {
  listLibrarySchema,
  searchLibrarySchema,
  getLibrarySchema,
  createLibrarySchema,
  updateLibrarySchema,
  deleteLibrarySchema
} = require("./schemas");

const router = express.Router();

router.use(authenticate);
router.use(facilityScope);

// Resolve the requested facility's operator BEFORE requireFacilityAccess so
// canAccessFacility's operator-wide branches evaluate correctly: an HQ Executive
// or cross-facility Admin whose access is granted at the operator level (no
// direct per-facility role row) must not be wrongly 403'd on a facility they
// legitimately cover. This mirrors mitigations/routes.js, which passes
// operatorId from the loaded record. `facilities` has no RLS policy, so the
// base-pool lookup is safe (facilityScope resolves operator scope the same way).
// facilityId lives in the query for reads and the body for writes.
function resolveLibraryScope(getFacilityId) {
  return async (req, _res, next) => {
    try {
      const facilityId = getFacilityId(req);
      let operatorId;
      if (facilityId) {
        const row = await db("facilities").where({ id: facilityId }).select("operator_id").first();
        operatorId = row?.operator_id;
      }
      req.libraryScope = { facilityId, operatorId };
      next();
    } catch (error) {
      next(error);
    }
  };
}

const scopeFromRequest = (req) => req.libraryScope;
const facilityIdFromQuery = (req) => req.query.facilityId;
const facilityIdFromBody = (req) => req.body.facilityId;

// Shared write path: run the caller's mutation and its audit row inside one
// transaction on the request's RLS-scoped connection (a savepoint under
// facilityScope's request transaction), so both commit or roll back together.
async function runLibraryMutation({ req, facilityId, actionType, mutate }) {
  return activeConn().transaction(async (trx) => {
    const { entry, diff } = await mutate(trx);
    await appendAuditLog(
      {
        actionType,
        userId: req.user.id,
        actingRole: req.actingRole,
        facilityId,
        assessmentId: null,
        entityType: "library_entry",
        entityId: entry.id,
        diff,
        metadata: { type: entry.type, title: entry.title },
        traceId: req.traceId
      },
      trx
    );
    return { entry, diff };
  });
}

// Fire the semantic-search embedding AFTER the write commits. The job is
// REGISTERED synchronously here (so drainEmbeddings can't race it), but its work
// waits on `committed` — res "finish"/"close", which facilityScope emits
// post-COMMIT — so the embedding's separate transaction sees the committed row.
// Fire-and-forget: never blocks or fails the write; no-op when AI is disabled.
function scheduleEntryEmbedding(req, res, facilityId, entry) {
  if (!env.aiEnabled) {
    return;
  }
  const committed = new Promise((resolve) => {
    res.on("finish", resolve);
    res.on("close", resolve); // client abort: still settle so the job never hangs
  });
  scheduleEmbedding({
    entryId: entry.id,
    facilityId,
    title: entry.title,
    body: entry.body,
    userId: req.user.id,
    actingRole: req.actingRole,
    traceId: req.traceId,
    waitFor: committed
  });
}

router.get("/", validateRequest(listLibrarySchema), resolveLibraryScope(facilityIdFromQuery), requireFacilityAccess(scopeFromRequest), async (req, res, next) => {
  try {
    const entries = await listLibraryEntries({
      facilityId: req.query.facilityId,
      type: req.query.type
    });
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

// Semantic search — MUST be registered before "/:id" so "search" is not parsed
// as an entry id. Embeds the query (an AI call — audited + budgeted; no LLM/chat
// call, just an embedding) then cosine-ranks the facility's entries. 404 when AI
// is off, matching the "features 404 cleanly when disabled" posture.
router.get(
  "/search",
  validateRequest(searchLibrarySchema),
  resolveLibraryScope(facilityIdFromQuery),
  requireFacilityAccess(scopeFromRequest),
  async (req, res, next) => {
    try {
      if (!env.aiEnabled) {
        throw new DomainError("Semantic search is not enabled", 404, "AI_FEATURE_DISABLED");
      }
      const { facilityId, q, type } = req.query;
      const { output } = await runAiCall({
        feature: "semantic_search",
        kind: "embedding",
        facilityId,
        userId: req.user.id,
        actingRole: req.actingRole,
        traceId: req.traceId,
        value: q
      });
      const entries = await searchByEmbedding({ facilityId, type, embedding: output, limit: 10 });
      res.json({ entries });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:id", validateRequest(getLibrarySchema), resolveLibraryScope(facilityIdFromQuery), requireFacilityAccess(scopeFromRequest), async (req, res, next) => {
  try {
    const entry = await getLibraryEntry({ id: req.params.id, facilityId: req.query.facilityId });
    if (!entry) {
      throw new DomainError("Library entry not found in this facility", 404, "LIBRARY_ENTRY_NOT_FOUND");
    }
    res.json({ entry });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  authorizeRole(ROLES.ADMIN),
  validateRequest(createLibrarySchema),
  resolveLibraryScope(facilityIdFromBody),
  requireFacilityAccess(scopeFromRequest),
  async (req, res, next) => {
    try {
      const { facilityId, ...input } = req.body;
      const { entry } = await runLibraryMutation({
        req,
        facilityId,
        actionType: "library-entry-created",
        mutate: (trx) => createLibraryEntry({ facilityId, input, trx })
      });
      // A new entry always needs an embedding.
      scheduleEntryEmbedding(req, res, facilityId, entry);
      res.status(201).json({ entry });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:id",
  authorizeRole(ROLES.ADMIN),
  validateRequest(updateLibrarySchema),
  resolveLibraryScope(facilityIdFromBody),
  requireFacilityAccess(scopeFromRequest),
  async (req, res, next) => {
    try {
      const { facilityId, ...input } = req.body;
      const { entry, diff } = await runLibraryMutation({
        req,
        facilityId,
        actionType: "library-entry-updated",
        mutate: (trx) => updateLibraryEntry({ id: req.params.id, facilityId, input, trx })
      });
      // Re-embed only when the embeddable text (title/body) actually changed — a
      // metadata-only edit must not spend an AI call.
      if (diff.title || diff.body) {
        scheduleEntryEmbedding(req, res, facilityId, entry);
      }
      res.json({ entry });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:id",
  authorizeRole(ROLES.ADMIN),
  validateRequest(deleteLibrarySchema),
  resolveLibraryScope(facilityIdFromBody),
  requireFacilityAccess(scopeFromRequest),
  async (req, res, next) => {
    try {
      const { facilityId } = req.body;
      const { entry } = await runLibraryMutation({
        req,
        facilityId,
        actionType: "library-entry-deleted",
        mutate: (trx) => deleteLibraryEntry({ id: req.params.id, facilityId, trx })
      });
      res.json({ entry: { id: entry.id, deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
