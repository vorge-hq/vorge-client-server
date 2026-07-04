// P3 — request validation for content-write endpoints. Every content mutation
// REQUIRES `lockVersion` in the body (optimistic concurrency); a missing/ill
// value is a 400 VALIDATION_ERROR, never a silent last-write-wins. Schemas wrap
// { body, params, query } to match middleware/validateRequest.
const { z } = require("zod");
const { NARRATIVE_SECTIONS } = require("../../repositories/sectionRepository");

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

// --- Threats (Section 4) — same shape as assets, likelihood is an int ---------
const threatParams = assessmentParams.extend({ threatId: z.string().uuid() });

const createThreatSchema = z.object({
  params: assessmentParams,
  body: z.object({
    lockVersion,
    name: z.string().min(1),
    likelihood: z.number().int().nullish(),
    details: details.optional()
  })
});

const updateThreatSchema = z.object({
  params: threatParams,
  body: z.object({
    lockVersion,
    name: z.string().min(1).optional(),
    likelihood: z.number().int().nullish(),
    details: details.optional()
  })
});

const deleteThreatSchema = z.object({
  params: threatParams,
  body: z.object({ lockVersion })
});

// --- Asset×threat links (Section 5) — PUT enable/disable -----------------------
const putLinkSchema = z.object({
  params: assessmentParams.extend({ assetId: z.string().uuid(), threatId: z.string().uuid() }),
  body: z.object({ lockVersion, enabled: z.boolean() })
});

// --- Evaluations (Section 6) — PATCH only -------------------------------------
const riskObject = z.record(z.string(), z.any());
const updateEvaluationSchema = z.object({
  params: assessmentParams.extend({ evaluationId: z.string().uuid() }),
  body: z.object({
    lockVersion,
    scenario: z.string().optional(),
    controls: z.string().optional(),
    vulnerabilities: z.string().optional(),
    proposedMitigation: z.string().optional(),
    r1: riskObject.optional(),
    r2: riskObject.optional()
  })
});

// --- Contributors (Section 9.A) — PUT replaces the whole list ------------------
const putContributorsSchema = z.object({
  params: assessmentParams,
  body: z.object({
    lockVersion,
    contributors: z.array(z.record(z.string(), z.any()))
  })
});

// --- Section text (Sections 1/2/8) — PUT /sections/:n -------------------------
// `n` is a path param (string) coerced to int and restricted to the narrative
// set; a non-narrative number is a 400. contentText allows "" (empty round-trip).
const putSectionSchema = z.object({
  params: assessmentParams.extend({
    n: z.coerce
      .number()
      .int()
      .refine((v) => NARRATIVE_SECTIONS.includes(v), { message: "section is not an editable narrative section" })
  }),
  body: z.object({ lockVersion, contentText: z.string() })
});

// --- Lead Author reassignment (§5.5) — PUT /lead-author ----------------------
const reassignLeadAuthorSchema = z.object({
  params: assessmentParams,
  body: z.object({
    lockVersion,
    leadAuthorUserId: z.string().uuid(),
    reason: z.string().max(500).optional()
  })
});

// --- Mitigation owner assignment (§7) — PUT /mitigations/:id/owner ------------
// At least one of ownerUserId / ownerRoleLabel must be present. ownerUserId may
// be null (unassign a specific user, fall back to the pool label).
const assignMitigationOwnerSchema = z.object({
  params: assessmentParams.extend({ mitigationId: z.string().uuid() }),
  body: z
    .object({
      lockVersion,
      ownerUserId: z.string().uuid().nullish(),
      ownerRoleLabel: z.string().nullish()
    })
    .refine((b) => b.ownerUserId !== undefined || b.ownerRoleLabel !== undefined, {
      message: "provide ownerUserId and/or ownerRoleLabel"
    })
});

// --- Smart tagging (§9.6) — evaluation-scoped -------------------------------
// suggest-tags takes no body: the scenario text is read server-side from the
// evaluation the client just saved (single source of truth; also feeds the
// facility-scope invariant via buildPromptContext). confirm carries the Author's
// final chosen set — each tag names its category + canonical value + source; the
// route re-validates every value against the facility vocabulary before persist.
const evaluationParams = assessmentParams.extend({ evaluationId: z.string().uuid() });
const tagCategory = z.enum(["threat_type", "asset_class", "region", "consequence_category"]);

const suggestTagsSchema = z.object({ params: evaluationParams });
const getTagsSchema = z.object({ params: evaluationParams });
const confirmTagsSchema = z.object({
  params: evaluationParams,
  body: z.object({
    tags: z
      .array(
        z.object({
          category: tagCategory,
          value: z.string().min(1),
          source: z.enum(["ai", "manual"]).optional()
        })
      )
      .max(12)
  })
});

module.exports = {
  suggestTagsSchema,
  getTagsSchema,
  confirmTagsSchema,
  createAssetSchema,
  updateAssetSchema,
  deleteAssetSchema,
  putSectionSchema,
  reassignLeadAuthorSchema,
  assignMitigationOwnerSchema,
  createThreatSchema,
  updateThreatSchema,
  deleteThreatSchema,
  putLinkSchema,
  updateEvaluationSchema,
  putContributorsSchema
};
