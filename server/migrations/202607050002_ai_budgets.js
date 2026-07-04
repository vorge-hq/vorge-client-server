// P4 · O2 — ai_budgets: the per-scope monthly ceiling (businesslogic §9 /
// §19.11). Defaults: $50/facility/month, $20/operator/month.
//
// Suspension is COMPUTED, never stored: a scope is suspended when its
// month-to-date SUM(cost_usd) in ai_call_log >= monthly_usd. Month rollover
// then resumes automatically because the SUM is scoped to the current month —
// there is no stored "suspended" flag to clear.
//
// soft_alerted_for_month records the 'YYYY-MM' (UTC) in which the 80% soft
// alert last fired, so the alert fires at most once per scope per month.
//
// RLS: facility-scoped budget rows follow the same GUC predicate as every other
// facility table; operator-scoped rows are reached only by the system job /
// platform surfaces via explicit owner-role queries.

const PREDICATE = `
  scope = 'facility'
  AND scope_id = ANY (
    string_to_array(
      NULLIF(current_setting('app.current_facility_ids', true), ''),
      ','
    )::uuid[]
  )
`;

exports.up = async function up(knex) {
  await knex.schema.createTable("ai_budgets", (table) => {
    table.uuid("id").primary();
    table.text("scope").notNullable();
    table.uuid("scope_id").notNullable();
    table.specificType("monthly_usd", "numeric(10,2)").notNullable();
    table.text("soft_alerted_for_month");
    table.timestamps(true, true);
    table.unique(["scope", "scope_id"]);
  });

  await knex.raw(`
    ALTER TABLE ai_budgets
      ADD CONSTRAINT ai_budgets_scope_check
      CHECK (scope IN ('facility', 'operator'))
  `);

  // A ceiling must be positive. evaluateCeiling maps monthly_usd <= 0 to
  // "exhausted", so a mis-seeded 0/negative row would silently brick a scope
  // with AI_BUDGET_EXHAUSTED — turn that into a write-time error. Disabling AI
  // is done via entitlements / AI_ENABLED, never a zero budget.
  await knex.raw(`
    ALTER TABLE ai_budgets
      ADD CONSTRAINT ai_budgets_monthly_usd_positive_check
      CHECK (monthly_usd > 0)
  `);

  await knex.raw("ALTER TABLE ai_budgets ENABLE ROW LEVEL SECURITY");
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON ai_budgets");
  await knex.raw(`
    CREATE POLICY facility_isolation ON ai_budgets
      USING (${PREDICATE})
      WITH CHECK (${PREDICATE})
  `);
};

exports.down = async function down(knex) {
  await knex.raw("DROP POLICY IF EXISTS facility_isolation ON ai_budgets");
  await knex.schema.dropTableIfExists("ai_budgets");
};
