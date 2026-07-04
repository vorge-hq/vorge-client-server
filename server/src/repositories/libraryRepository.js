// P4 · O1 — Library management CRUD (prereq for semantic search). library_entries
// is a facility-scoped DATA table: every read/write is pinned to the request's
// facility context by facilityScope (RLS) AND filtered by facility_id here, so a
// row from another facility is never visible even if an id is guessed.
//
// Writes run INSIDE the caller's transaction (trx always passed) alongside the
// audit append, so a mutation + its audit row commit or roll back together —
// the same atomic-savepoint discipline as contentWriteGuard. The embedding
// column arrives in O3; these functions leave it untouched (create/update fire
// the async embedding pipeline post-commit from the route, not here).
const crypto = require("crypto");
const { activeConn } = require("../db/requestScope");
const { DomainError } = require("../services/domainError");

function mapLibraryEntry(row) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// List every entry in the facility, optionally filtered to a single library
// type. Deterministic ordering (title, then id) so list responses are stable.
async function listLibraryEntries({ facilityId, type, conn = activeConn() }) {
  const query = conn("library_entries").where({ facility_id: facilityId });
  if (type) {
    query.where({ type });
  }
  const rows = await query.orderBy("title").orderBy("id");
  return rows.map(mapLibraryEntry);
}

// Load one entry scoped to its facility. Returns null (not throws) so the route
// answers 404 without leaking whether the id exists in another facility.
async function getLibraryEntry({ id, facilityId, conn = activeConn() }) {
  const row = await conn("library_entries").where({ id, facility_id: facilityId }).first();
  return row ? mapLibraryEntry(row) : null;
}

async function createLibraryEntry({ facilityId, input, trx }) {
  const id = crypto.randomUUID();
  const [row] = await trx("library_entries")
    .insert({
      id,
      facility_id: facilityId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: JSON.stringify(input.metadata ?? {})
    })
    .returning("*");

  const entry = mapLibraryEntry(row);
  // A create is a change of every field from nothing (null) to its new value —
  // matching the [before, after] diff shape the rest of the audit log uses.
  const diff = {
    type: [null, entry.type],
    title: [null, entry.title],
    body: [null, entry.body],
    metadata: [null, entry.metadata]
  };
  return { entry, diff };
}

async function updateLibraryEntry({ id, facilityId, input, trx }) {
  const existing = await getLibraryEntry({ id, facilityId, conn: trx });
  if (!existing) {
    throw new DomainError("Library entry not found in this facility", 404, "LIBRARY_ENTRY_NOT_FOUND");
  }

  const changes = {};
  const diff = {};
  if (input.type !== undefined && input.type !== existing.type) {
    changes.type = input.type;
    diff.type = [existing.type, input.type];
  }
  if (input.title !== undefined && input.title !== existing.title) {
    changes.title = input.title;
    diff.title = [existing.title, input.title];
  }
  if (input.body !== undefined && input.body !== existing.body) {
    changes.body = input.body;
    diff.body = [existing.body, input.body];
  }
  if (input.metadata !== undefined && JSON.stringify(input.metadata) !== JSON.stringify(existing.metadata)) {
    changes.metadata = JSON.stringify(input.metadata);
    diff.metadata = [existing.metadata, input.metadata];
  }

  let entry = existing;
  if (Object.keys(changes).length > 0) {
    changes.updated_at = trx.fn.now();
    const [row] = await trx("library_entries").where({ id, facility_id: facilityId }).update(changes).returning("*");
    entry = mapLibraryEntry(row);
  }

  return { entry, diff };
}

// pgvector text input format: "[a,b,c]". Rejects a non-array or wrong dimension
// up front so a malformed vector never reaches the DB as a confusing cast error.
const EMBEDDING_DIMS = 1536;
function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMS) {
    throw new DomainError(
      `Embedding must be a ${EMBEDDING_DIMS}-dim number array (got ${Array.isArray(embedding) ? embedding.length : typeof embedding})`,
      500,
      "EMBEDDING_SHAPE_INVALID"
    );
  }
  // Every element must be a finite number — a NaN/Infinity/string element would
  // pass the length check and then blow up as an opaque pgvector cast error.
  for (const value of embedding) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new DomainError("Embedding contains a non-finite value", 500, "EMBEDDING_SHAPE_INVALID");
    }
  }
  return `[${embedding.join(",")}]`;
}

// Store an entry's embedding vector. Scoped by facility_id (RLS + explicit) so
// the async post-commit pipeline can only ever write within the entry's facility.
// Does NOT bump updated_at — the embedding is a derived field, not a user edit.
//
// Stale-write guard: when title/body are given, the UPDATE also matches on them,
// so a slower/older concurrent embed (whose text no longer matches the row) hits
// 0 rows and is skipped — the newer edit's embed stores the fresh vector.
async function setEmbedding({ id, facilityId, embedding, title, body, conn = activeConn() }) {
  const literal = toVectorLiteral(embedding);
  const query = conn("library_entries").where({ id, facility_id: facilityId });
  if (title !== undefined) {
    query.where({ title });
  }
  if (body !== undefined) {
    query.where({ body });
  }
  const updated = await query.update({ embedding: conn.raw("?::vector", [literal]) });
  return updated; // rows affected (0 if deleted or superseded by a newer edit)
}

// Cosine-similarity search within a facility (+ optional type), NULL-embedding
// rows skipped. Orders by pgvector cosine DISTANCE (<=>) ascending — most
// similar first — and returns similarity = 1 - distance. Selects explicit
// columns (never the raw vector) so responses stay lean.
async function searchByEmbedding({ facilityId, type, embedding, limit = 10, conn = activeConn() }) {
  const literal = toVectorLiteral(embedding);
  const query = conn("library_entries")
    .where({ facility_id: facilityId })
    .whereNotNull("embedding")
    .select(
      "id",
      "facility_id",
      "type",
      "title",
      "body",
      "metadata",
      "created_at",
      "updated_at",
      conn.raw("1 - (embedding <=> ?::vector) AS similarity", [literal])
    )
    .orderByRaw("embedding <=> ?::vector", [literal])
    .limit(limit);
  if (type) {
    query.where({ type });
  }
  const rows = await query;
  return rows.map((row) => ({ ...mapLibraryEntry(row), similarity: Number(row.similarity) }));
}

// The re-embedding script's source list: every entry in a facility (id + text),
// optionally only those still missing an embedding.
async function listEntriesForEmbedding({ facilityId, onlyMissing = false, conn = activeConn() }) {
  const query = conn("library_entries").where({ facility_id: facilityId }).select("id", "title", "body");
  if (onlyMissing) {
    query.whereNull("embedding");
  }
  return query.orderBy("id");
}

async function deleteLibraryEntry({ id, facilityId, trx }) {
  const existing = await getLibraryEntry({ id, facilityId, conn: trx });
  if (!existing) {
    throw new DomainError("Library entry not found in this facility", 404, "LIBRARY_ENTRY_NOT_FOUND");
  }

  await trx("library_entries").where({ id, facility_id: facilityId }).del();

  const diff = { deleted: [existing, null] };
  return { entry: existing, diff };
}

module.exports = {
  mapLibraryEntry,
  toVectorLiteral,
  EMBEDDING_DIMS,
  listLibraryEntries,
  getLibraryEntry,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  setEmbedding,
  searchByEmbedding,
  listEntriesForEmbedding
};
