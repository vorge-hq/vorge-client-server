// P3 — request validation for content-write endpoints. Every content mutation
// REQUIRES `lockVersion` in the body (optimistic concurrency); a missing/ill
// value is a 400 VALIDATION_ERROR, never a silent last-write-wins. Schemas wrap
// { body, params, query } to match middleware/validateRequest.
const { z } = require("zod");

// A non-negative integer version the client read. Required everywhere — omitting
// it must fail validation (400), so no coercion of undefined into a default.
const lockVersion = z.number({ required_error: "lockVersion is required" }).int().min(0);

const assessmentParams = z.object({ assessmentId: z.string().uuid() });
const assetParams = assessmentParams.extend({ assetId: z.string().uuid() });

// Optional free-form structured detail bag (jsonb column). Objects only.
const details = z.record(z.string(), z.any());

const createAssetSchema = z.object({
  params: assessmentParams,
  body: z.object({
    lockVersion,
    name: z.string().min(1),
    assetType: z.string().nullish(),
    criticality: z.string().nullish(),
    details: details.optional()
  })
});

const updateAssetSchema = z.object({
  params: assetParams,
  body: z.object({
    lockVersion,
    name: z.string().min(1).optional(),
    assetType: z.string().nullish(),
    criticality: z.string().nullish(),
    details: details.optional()
  })
});

const deleteAssetSchema = z.object({
  params: assetParams,
  body: z.object({ lockVersion })
});

module.exports = {
  createAssetSchema,
  updateAssetSchema,
  deleteAssetSchema
};
