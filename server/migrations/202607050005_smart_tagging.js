// P4 · O4 — Smart tagging (§9.6). Two facility-scoped tables:
//
//   tag_vocabulary  — the controlled vocabulary a facility's scenarios may be
//                     tagged with, in four categories (threat_type, asset_class,
//                     region, consequence_category). Seeded per facility from the
//                     §19.1 threat classifications + asset classes (see
//                     services/tagVocabularyService.DEFAULT_VOCABULARY; demo/
//                     staging rows land via db/seed.js, real facilities at
//                     provision time in O8). Admin curation UI is post-v1.
//
//   scenario_tags   — tags attached to one evaluation's risk scenario. AI
//                     suggestions land as (source ai, status suggested); the
//                     Author's confirm flips them to confirmed / removed and may
//                     add manual (source manual) tags. The audit records the
//                     suggested set and the confirmed set separately (§9.6).
//
// RLS: both tables carry facility_id (denormalized onto scenario_tags exactly
// as mitigations carries it alongside evaluation_id) so the standard facility
// GUC predicate applies — a facility only ever sees its own vocabulary and tags.
const CATEGORY_CHECK = "category IN ('threat_type', 'asset_class', 'region', 'consequence_category')";

const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

async function enableRls(knex, tableName) {
  await knex.raw(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`DROP POLICY IF EXISTS facility_isolation ON ${tableName}`);
  await knex.raw(`
    CREATE POLICY facility_isolation ON ${tableName}
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);
}

exports.up = async function up(knex) {
  await knex.schema.createTable("tag_vocabulary", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.text("category").notNullable();
    table.text("value").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["facility_id", "category", "value"]);
  });
  await knex.raw(`ALTER TABLE tag_vocabulary ADD CONSTRAINT tag_vocabulary_category_check CHECK (${CATEGORY_CHECK})`);
  await enableRls(knex, "tag_vocabulary");

  await knex.schema.createTable("scenario_tags", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("evaluation_id").notNullable().references("id").inTable("evaluations").onDelete("CASCADE");
    table.text("category").notNullable();
    table.text("tag_value").notNullable();
    table.text("source").notNullable();
    table.text("status").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    // One row per distinct tag on an evaluation — re-suggest/confirm upserts.
    table.unique(["evaluation_id", "category", "tag_value"]);
    table.index(["evaluation_id"]);
  });
  await knex.raw(`ALTER TABLE scenario_tags ADD CONSTRAINT scenario_tags_category_check CHECK (${CATEGORY_CHECK})`);
  await knex.raw("ALTER TABLE scenario_tags ADD CONSTRAINT scenario_tags_source_check CHECK (source IN ('ai', 'manual'))");
  await knex.raw(
    "ALTER TABLE scenario_tags ADD CONSTRAINT scenario_tags_status_check CHECK (status IN ('suggested', 'confirmed', 'removed'))"
  );
  await enableRls(knex, "scenario_tags");
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON scenario_tags");
  await knex.schema.dropTableIfExists("scenario_tags");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON tag_vocabulary");
  await knex.schema.dropTableIfExists("tag_vocabulary");
};
