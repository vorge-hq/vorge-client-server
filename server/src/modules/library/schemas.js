// P4 · O1 — request validation for library CRUD. Schemas wrap { body, params,
// query } to match middleware/validateRequest. facilityId is REQUIRED on every
// route (query on reads, body on writes) — it is what requireFacilityAccess
// checks against the acting role's scope, so an omitted/ill value is a 400
// before the guard, never a silent all-facility read.
const { z } = require("zod");
const { LIBRARY_TYPES } = require("../../services/constants");

const facilityId = z.string({ required_error: "facilityId is required" }).uuid();
const libraryType = z.enum(LIBRARY_TYPES);
// Free-form structured detail bag (jsonb column). Objects only.
const metadata = z.record(z.string(), z.any());
const entryParams = z.object({ id: z.string().uuid() });

// GET /api/library?facilityId=&type= — type is an optional filter.
const listLibrarySchema = z.object({
  query: z.object({
    facilityId,
    type: libraryType.optional()
  })
});

// GET /api/library/search?facilityId=&q=&type= — semantic search (O3).
const searchLibrarySchema = z.object({
  query: z.object({
    facilityId,
    q: z.string().min(1),
    type: libraryType.optional()
  })
});

// GET /api/library/:id?facilityId=
const getLibrarySchema = z.object({
  params: entryParams,
  query: z.object({ facilityId })
});

// POST /api/library
const createLibrarySchema = z.object({
  body: z.object({
    facilityId,
    type: libraryType,
    title: z.string().min(1),
    body: z.string().min(1),
    metadata: metadata.optional()
  })
});

// PUT /api/library/:id — every content field optional (partial update), but at
// least facilityId is always present for the scope check.
const updateLibrarySchema = z.object({
  params: entryParams,
  body: z.object({
    facilityId,
    type: libraryType.optional(),
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    metadata: metadata.optional()
  })
});

// DELETE /api/library/:id
const deleteLibrarySchema = z.object({
  params: entryParams,
  body: z.object({ facilityId })
});

module.exports = {
  listLibrarySchema,
  searchLibrarySchema,
  getLibrarySchema,
  createLibrarySchema,
  updateLibrarySchema,
  deleteLibrarySchema
};
