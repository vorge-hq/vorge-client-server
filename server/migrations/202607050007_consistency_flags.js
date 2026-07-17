// P4 · O7 — consistency_flags: the nightly cross-facility outlier flags (§9.3).
// One row = "this facility's rating for this scenario cluster diverges 2+ sigma
// from its peers in the same operator's portfolio", with an LLM prose rationale
// and the §9.3 lifecycle (pending → dismissed | sent_back | expired).
//
// Written ONLY by the nightly job (src/jobs/consistencyFlagging.js), which runs
// as the DB owner outside any request. Read by HQ Executives through the normal
// request path, so the standard facility GUC RLS predicate applies: an HQ user's
// scope is their operator's facilities, and the predicate keeps a facility's
// flags inside that facility.
//
// Beyond the plan's column list (bake-in, recorded in SESSION_LOG):
//   - assessment_id / evaluation_id: §9.3 requires a "drill-into-facility link"
//     and a "send back to Author" action — both need the row the flag is about.
//   - unique (evaluation_id, cluster_key): the job re-runs EVERY night. Without
//     a natural key it would re-insert the same flag nightly. The upsert
//     refreshes the statistics + rationale and deliberately does NOT reset
//     `status` — an HQ Executive's dismissal must survive the next run.
//   - severity vocabulary (low|medium|high) — the plan names the column but not
//     its values; derived from sigma by services/consistencyService.js.

const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  await knex.schema.createTable("consistency_flags", (table) => {
    table.uuid("id").primary();
    table.uuid("operator_id").notNullable().references("id").inTable("operators").onDelete("CASCADE");
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.uuid("evaluation_id").notNullable().references("id").inTable("evaluations").onDelete("CASCADE");
    table.text("cluster_key").notNullable();
    table.text("severity").notNullable();
    table.decimal("divergence_sigma", 6, 3).notNullable();
    // Nullable BY DESIGN: an AI failure must not cost HQ the divergence itself.
    // The job stores the flag with a null rationale and logs the failure.
    table.text("rationale");
    table.text("status").notNullable().defaultTo("pending");
    table.text("dismissed_reason");
    table.uuid("dismissed_by").references("id").inTable("users").onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.unique(["evaluation_id", "cluster_key"], { indexName: "consistency_flags_unique" });
    // The HQ read: every pending flag across an operator's portfolio.
    table.index(["operator_id", "status"]);
    table.index(["facility_id", "status"]);
  });

  await knex.raw(`
    ALTER TABLE consistency_flags
      ADD CONSTRAINT consistency_flags_status_check
      CHECK (status IN ('pending', 'dismissed', 'sent_back', 'expired'))
  `);

  await knex.raw(`
    ALTER TABLE consistency_flags
      ADD CONSTRAINT consistency_flags_severity_check
      CHECK (severity IN ('low', 'medium', 'high'))
  `);

  await knex.raw("ALTER TABLE consistency_flags ENABLE ROW LEVEL SECURITY");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON consistency_flags");
  await knex.raw(`
    CREATE POLICY facility_isolation ON consistency_flags
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);

  // ── Staging seed (run manually as the DB owner until the O9 toggle UI) ────
  //   INSERT INTO facility_entitlements (id, facility_id, feature_key, enabled)
  //   VALUES (gen_random_uuid(), '<facility-uuid>', 'consistency_flagging', true)
  //   ON CONFLICT (facility_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;
  // Then: npm --prefix server run job:consistency
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON consistency_flags");
  await knex.schema.dropTableIfExists("consistency_flags");
};
