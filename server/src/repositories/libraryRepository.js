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
  listLibraryEntries,
  getLibraryEntry,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry
};
