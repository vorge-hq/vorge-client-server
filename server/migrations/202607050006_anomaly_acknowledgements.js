// P4 · O6 — anomaly_acknowledgements: an Author's dismissal of one anomaly flag
// on one assessment (§9.2). Suppression is deliberately PER-AUTHOR PER-ASSESSMENT:
// another Author editing the same record sees the warning fresh, so a dismissal
// is never a facility-wide silencing of a rule.
//
// The flag itself is NOT stored — flags are recomputed on every anomaly-check
// (deterministic rules + LLM contextual checks) and matched against these rows to
// decide what the client renders. Only the dismissal is durable.
//
// `facility_id` is denormalized onto the row (it is derivable via assessment_id)
// so the standard facility GUC RLS predicate applies directly, exactly as
// scenario_tags does — RLS cannot follow a join cheaply.
//
// `rule_key` is intentionally free text, not a CHECK: the rule catalogue is
// curated over time (§9.2 "rule curation work owned by the platform operator")
// and a new rule must not require a migration. `reason` IS constrained — it is
// the fixed §9.2 picker (Not applicable / False positive / Will address / Other).

const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  await knex.schema.createTable("anomaly_acknowledgements", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.uuid("author_user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("rule_key").notNullable();
    table.text("entity_type").notNullable();
    table.uuid("entity_id").notNullable();
    table.text("reason").notNullable();
    table.text("reason_text");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["assessment_id", "author_user_id", "rule_key", "entity_type", "entity_id"], {
      indexName: "anomaly_ack_unique"
    });
    // The hot read: every anomaly-check loads this Author's acks for this
    // assessment to subtract them from the freshly computed flags.
    table.index(["assessment_id", "author_user_id"]);
  });

  await knex.raw(`
    ALTER TABLE anomaly_acknowledgements
      ADD CONSTRAINT anomaly_acknowledgements_reason_check
      CHECK (reason IN ('not_applicable', 'false_positive', 'will_address', 'other'))
  `);

  await knex.raw(`
    ALTER TABLE anomaly_acknowledgements
      ADD CONSTRAINT anomaly_acknowledgements_entity_type_check
      CHECK (entity_type IN ('asset', 'threat', 'evaluation'))
  `);

  await knex.raw("ALTER TABLE anomaly_acknowledgements ENABLE ROW LEVEL SECURITY");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON anomaly_acknowledgements");
  await knex.raw(`
    CREATE POLICY facility_isolation ON anomaly_acknowledgements
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON anomaly_acknowledgements");
  await knex.schema.dropTableIfExists("anomaly_acknowledgements");
};
