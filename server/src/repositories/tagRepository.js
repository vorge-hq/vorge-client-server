// P4 · O4 — smart-tagging persistence (§9.6). tag_vocabulary and scenario_tags
// are facility-scoped DATA tables: every read/write is pinned to the request's
// facility context by facilityScope (RLS) AND filtered by facility_id here.
// Mutations run INSIDE the caller's transaction (trx always passed) alongside
// the audit append — the same atomic-savepoint discipline as contentWriteGuard.
const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");

function mapTag(row) {
  return {
    id: row.id,
    evaluationId: row.evaluation_id,
    category: row.category,
    value: row.tag_value,
    source: row.source,
    status: row.status
  };
}

// The facility's controlled vocabulary as [{category, value}], for validating
// AI suggestions and manual additions. RLS + the facility_id filter keep it to
// the requester's facility.
async function getVocabulary({ facilityId, conn = activeConn() }) {
  const rows = await conn("tag_vocabulary")
    .where({ facility_id: facilityId })
    .select("category", "value")
    .orderBy("category")
    .orderBy("value");
  return rows.map((r) => ({ category: r.category, value: r.value }));
}

// All non-removed tags on an evaluation, for hydration and the confirm read.
async function listTagsForEvaluation({ facilityId, evaluationId, conn = activeConn() }) {
  const rows = await conn("scenario_tags")
    .where({ facility_id: facilityId, evaluation_id: evaluationId })
    .whereNot({ status: "removed" })
    .orderBy("category")
    .orderBy("tag_value");
  return rows.map(mapTag);
}

// Replace the evaluation's outstanding AI suggestions with a fresh set. Prior
// (source ai, status suggested) rows are cleared first so a re-suggest never
// stacks stale chips. A tag the Author has already ACTED ON (confirmed or added
// manually — i.e. any non-removed row) is left as-is: suggestions never demote
// it. A previously-REMOVED tag, however, is revived back to a suggestion (the
// unique key still holds its row), so re-running suggest can resurface a tag the
// Author earlier dismissed if the model proposes it again. Returns the persisted
// suggested rows.
async function saveSuggestedTags({ facilityId, evaluationId, tags, trx }) {
  await trx("scenario_tags")
    .where({ facility_id: facilityId, evaluation_id: evaluationId, source: "ai", status: "suggested" })
    .del();

  // Only non-removed rows block a re-suggestion; a removed row is eligible to be
  // revived via the upsert below.
  const active = await trx("scenario_tags")
    .where({ facility_id: facilityId, evaluation_id: evaluationId })
    .whereNot({ status: "removed" })
    .select("category", "tag_value");
  const have = new Set(active.map((r) => `${r.category}::${r.tag_value}`));

  const persisted = [];
  for (const tag of tags) {
    if (have.has(`${tag.category}::${tag.value}`)) {
      continue;
    }
    // Upsert (not plain insert): a removed row for this (evaluation, category,
    // value) still occupies the unique key — merge flips it back to an ai
    // suggestion instead of colliding.
    const [row] = await trx("scenario_tags")
      .insert({
        id: crypto.randomUUID(),
        facility_id: facilityId,
        evaluation_id: evaluationId,
        category: tag.category,
        tag_value: tag.value,
        source: "ai",
        status: "suggested"
      })
      .onConflict(["evaluation_id", "category", "tag_value"])
      .merge({ source: "ai", status: "suggested", updated_at: trx.fn.now() })
      .returning("*");
    persisted.push(mapTag(row));
  }
  return persisted;
}

// Persist the Author's final chosen set as `confirmed`. Everything currently on
// the evaluation is marked `removed` first, then the chosen tags are upserted to
// `confirmed` (source preserved per tag) — so a de-selected chip drops out and
// the confirmed set is exactly what the Author kept/added. Returns the confirmed
// rows. `tags` is [{category, value, source}], already validated against vocab.
async function confirmTags({ facilityId, evaluationId, tags, trx }) {
  await trx("scenario_tags")
    .where({ facility_id: facilityId, evaluation_id: evaluationId })
    .whereNot({ status: "removed" })
    .update({ status: "removed", updated_at: trx.fn.now() });

  const confirmed = [];
  for (const tag of tags) {
    const [row] = await trx("scenario_tags")
      .insert({
        id: crypto.randomUUID(),
        facility_id: facilityId,
        evaluation_id: evaluationId,
        category: tag.category,
        tag_value: tag.value,
        source: tag.source === "ai" ? "ai" : "manual",
        status: "confirmed"
      })
      .onConflict(["evaluation_id", "category", "tag_value"])
      .merge({ status: "confirmed", source: tag.source === "ai" ? "ai" : "manual", updated_at: trx.fn.now() })
      .returning("*");
    confirmed.push(mapTag(row));
  }
  return confirmed;
}

// Insert vocabulary rows for a facility (idempotent). Used by db/seed.js now and
// by O8 provisioning. `rows` is [{category, value}].
async function seedVocabulary({ facilityId, rows, trx }) {
  if (!rows || rows.length === 0) {
    return;
  }
  await trx("tag_vocabulary")
    .insert(
      rows.map((r) => ({
        id: crypto.randomUUID(),
        facility_id: facilityId,
        category: r.category,
        value: r.value
      }))
    )
    .onConflict(["facility_id", "category", "value"])
    .ignore();
}

module.exports = {
  mapTag,
  getVocabulary,
  listTagsForEvaluation,
  saveSuggestedTags,
  confirmTags,
  seedVocabulary
};
