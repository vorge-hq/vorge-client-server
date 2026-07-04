// P4 · O2 — facility-scoped prompt context builder. Features NEVER assemble
// entity data into prompts directly; they call buildPromptContext, which THROWS
// rather than silently filtering if any entity belongs to a different facility.
// This makes §9's "Facility A request can never include Facility B data"
// property hold BY CONSTRUCTION — a cross-facility leak is a 500, not a subtle
// data bleed.
//
// The ONLY cross-facility caller is the nightly consistency job, which uses the
// separate buildOperatorPromptContext (still throws on cross-OPERATOR data).
const { DomainError } = require("../services/domainError");

// Read an entity's facility id regardless of camel/snake shape (repos return
// either depending on the source).
function facilityIdOf(entity) {
  return entity.facilityId ?? entity.facility_id;
}

function operatorIdOf(entity) {
  return entity.operatorId ?? entity.operator_id;
}

// Assert every entity is in `facilityId`, then return them for prompt assembly.
// `entities` is an array of already-fetched, facility-scoped rows.
function buildPromptContext({ facilityId, entities = [] }) {
  if (!facilityId) {
    throw new DomainError("A facility scope is required to build prompt context", 500, "CROSS_FACILITY_PROMPT");
  }
  for (const entity of entities) {
    const entFacility = facilityIdOf(entity);
    if (entFacility && entFacility !== facilityId) {
      throw new DomainError(
        "Prompt context contains an entity outside the request's facility scope",
        500,
        "CROSS_FACILITY_PROMPT",
        { expectedFacilityId: facilityId, entityFacilityId: entFacility }
      );
    }
  }
  return { facilityId, entities };
}

// The consistency job spans facilities WITHIN one operator. It still refuses
// data from a different operator — the operator boundary is the hard wall for
// HQ features.
function buildOperatorPromptContext({ operatorId, facilities = [] }) {
  if (!operatorId) {
    throw new DomainError("An operator scope is required to build operator prompt context", 500, "CROSS_OPERATOR_PROMPT");
  }
  for (const entity of facilities) {
    const entOperator = operatorIdOf(entity);
    if (entOperator && entOperator !== operatorId) {
      throw new DomainError(
        "Operator prompt context contains an entity outside the request's operator scope",
        500,
        "CROSS_OPERATOR_PROMPT",
        { expectedOperatorId: operatorId, entityOperatorId: entOperator }
      );
    }
  }
  return { operatorId, facilities };
}

module.exports = { buildPromptContext, buildOperatorPromptContext };
