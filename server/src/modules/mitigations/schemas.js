const { z } = require("zod");

// The mitigation state machine (transitionMitigation) validates that nextStatus
// is a legal transition; this schema bounds shape and free-text length so
// oversized/malformed input is rejected before it reaches the handler and audit
// log, matching the validateRequest pattern used across the assessments module.
const logMitigationSchema = z.object({
  params: z.object({ mitigationId: z.string().min(1) }),
  body: z.object({
    nextStatus: z.string().min(1).max(64),
    note: z.string().max(5000).optional()
  })
});

module.exports = { logMitigationSchema };
