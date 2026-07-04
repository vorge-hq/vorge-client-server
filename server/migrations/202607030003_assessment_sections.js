// P3 · (a) — Section-text storage for the narrative sections (1 Executive
// Summary, 2 Facility Information, 8 Conclusion). No column stored this text
// today; all three lived only in client fixtures. We add a dedicated
// facility-scoped table rather than a JSONB blob on `assessments` so it slots
// into the existing RLS model unchanged (see the decision record
// docs/decisions/2026-07-03-assessment-sections-table.md).
//
//   assessment_sections(assessment_id, section_number) is UNIQUE — one row per
//   narrative section per assessment; content_text holds the full body.
//
// Additive + idempotent: guarded by hasTable, and the RLS policy uses
// DROP-then-CREATE (same pattern as 202607030002) so `migrate:latest` is safe
// to run twice.

// Mirrors 202607030002_rls_policies.js exactly: a row is visible/writable iff
// its facility_id is in the per-transaction context set app.current_facility_ids.
const POLICY = "facility_isolation";
const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("assessment_sections");
  if (!exists) {
    await knex.schema.createTable("assessment_sections", (table) => {
      table.uuid("id").primary();
      table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
      table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
      table.integer("section_number").notNullable();
      table.text("content_text").notNullable().defaultTo("");
      table.timestamps(true, true);
      table.unique(["assessment_id", "section_number"]);
      table.index(["facility_id"]);
    });
  }

  await knex.raw("ALTER TABLE assessment_sections ENABLE ROW LEVEL SECURITY");
  await knex.raw(`DROP POLICY IF EXISTS ${POLICY} ON assessment_sections`);
  await knex.raw(`
    CREATE POLICY ${POLICY} ON assessment_sections
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`DROP POLICY IF EXISTS ${POLICY} ON assessment_sections`);
  await knex.schema.dropTableIfExists("assessment_sections");
};
