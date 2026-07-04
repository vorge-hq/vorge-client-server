// P4 · O2 — ai_call_log: the dedicated audit + cost-accrual table for every AI
// call (businesslogic §9.7). This is NOT rows in audit_log_entries by design:
//   - §9.7 fields are structured/queryable — budget accrual is a monthly
//     SUM(cost_usd) per facility/operator, and cost dashboards read it directly;
//   - AI-call volume is high and the hash-chained audit_log_entries table must
//     stay lean;
//   - the §P4 spec's "audit row on every call" requirement is satisfied here.
//
// Every runAiCall outcome writes exactly one row — success AND every failure
// class (error, timeout, rate_limited, cost_ceiling_hit). See src/ai/index.js.
//
// RLS: the same facility_isolation predicate as migration 202607030002 — a row
// is visible/writable only when its facility_id is in the per-transaction GUC
// app.current_facility_ids. Operator-scoped rows (facility_id NULL) are written
// and read only by the system job + platform surfaces via explicit owner-role
// queries (the predicate denies NULL facility_id under the app role by design).

const PREDICATE = `
  facility_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  await knex.schema.createTable("ai_call_log", (table) => {
    table.uuid("id").primary();
    table.text("feature").notNullable();
    // Exactly one of facility_id / operator_id is set for a given call (enforced
    // by the CHECK below): facility features scope to a facility, HQ features
    // (consistency flagging) to an operator. Both nullable so either scope is
    // expressible. onDelete RESTRICT mirrors audit_log_entries — an audit + cost
    // trail must never be silently unscoped/orphaned by deleting its parent.
    table.uuid("facility_id").references("id").inTable("facilities").onDelete("RESTRICT");
    table.uuid("operator_id").references("id").inTable("operators").onDelete("RESTRICT");
    // 'system' is an allowed sentinel for batch jobs, so this is text not a uuid FK.
    table.text("user_id").notNullable();
    table.text("acting_role");
    // What the gateway REPORTED it routed to (providerMetadata / response
    // metadata), falling back to the requested string with
    // metadata.providerUnverified=true when the gateway omits it.
    table.text("provider").notNullable();
    table.text("model").notNullable();
    table.integer("input_tokens").notNullable().defaultTo(0);
    table.integer("output_tokens").notNullable().defaultTo(0);
    table.specificType("cost_usd", "numeric(10,6)").notNullable().defaultTo(0);
    table.integer("latency_ms").notNullable().defaultTo(0);
    table.text("outcome").notNullable();
    table.text("error_detail");
    table.text("trace_id");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["facility_id", "created_at"]);
    table.index(["operator_id", "created_at"]);
  });

  // outcome is a closed vocabulary (mirrors runAiCall's terminal states).
  await knex.raw(`
    ALTER TABLE ai_call_log
      ADD CONSTRAINT ai_call_log_outcome_check
      CHECK (outcome IN ('success', 'error', 'timeout', 'rate_limited', 'cost_ceiling_hit'))
  `);

  // Exactly one scope column is set — a both-null row is un-attributable and
  // invisible to every RLS role; a both-set row would be double-counted across
  // the facility AND operator accrual sums.
  await knex.raw(`
    ALTER TABLE ai_call_log
      ADD CONSTRAINT ai_call_log_single_scope_check
      CHECK ((facility_id IS NULL) <> (operator_id IS NULL))
  `);

  await knex.raw("ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON ai_call_log");
  await knex.raw(`
    CREATE POLICY facility_isolation ON ai_call_log
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON ai_call_log");
  await knex.schema.dropTableIfExists("ai_call_log");
};
