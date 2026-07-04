// P4 · O2 — facility_entitlements: per-facility on/off switch for the ADD-ON AI
// features. Base features (semantic search, smart tagging, drafted summaries)
// are ALWAYS ON — they have NO rows here, not enabled=true rows. Only the three
// gated features are representable:
//   anomaly_detection · consistency_flagging · offline_mode (P6).
//
// Read-time gating is plumbed into runAiCall from O2 (see src/ai/index.js). The
// write surface (owner-only entitlement toggle) ships in O9; until then seed
// staging rows with the SQL snippet at the bottom of this file.
//
// DECIDED 2026-07-04: owner-only writes v1. RLS uses the standard facility GUC
// predicate so a facility only ever sees its own entitlement rows.

const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  await knex.schema.createTable("facility_entitlements", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.text("feature_key").notNullable();
    table.boolean("enabled").notNullable().defaultTo(false);
    table.uuid("updated_by").references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["facility_id", "feature_key"]);
  });

  await knex.raw(`
    ALTER TABLE facility_entitlements
      ADD CONSTRAINT facility_entitlements_feature_key_check
      CHECK (feature_key IN ('anomaly_detection', 'consistency_flagging', 'offline_mode'))
  `);

  await knex.raw("ALTER TABLE facility_entitlements ENABLE ROW LEVEL SECURITY");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON facility_entitlements");
  await knex.raw(`
    CREATE POLICY facility_isolation ON facility_entitlements
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);

  // ── Staging seed (run manually as the DB owner to exercise add-on features
  //    before the O9 toggle UI exists) ──────────────────────────────────────
  //   INSERT INTO facility_entitlements (id, facility_id, feature_key, enabled)
  //   VALUES (gen_random_uuid(), '<facility-uuid>', 'anomaly_detection', true)
  //   ON CONFLICT (facility_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON facility_entitlements");
  await knex.schema.dropTableIfExists("facility_entitlements");
};
