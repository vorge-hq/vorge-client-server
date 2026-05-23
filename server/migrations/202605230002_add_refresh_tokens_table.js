exports.up = async function up(knex) {
  await knex.schema.createTable("refresh_tokens", (table) => {
    table.uuid("id").primary();
    table.text("token_hash").notNullable().unique();
    table.uuid("family_id").notNullable();
    table.uuid("parent_id").references("id").inTable("refresh_tokens").onDelete("SET NULL");
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("session_id").notNullable().references("id").inTable("sessions").onDelete("CASCADE");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    table.timestamp("used_at");
    table.timestamp("revoked_at");
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS refresh_family_active_idx
      ON refresh_tokens (family_id)
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS refresh_expires_idx
      ON refresh_tokens (expires_at)
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS refresh_user_idx
      ON refresh_tokens (user_id)
      WHERE revoked_at IS NULL;
  `);

  // RLS intentionally NOT enabled, matching the chunk-1 sessions table choice.
  // Initial schema enables RLS without policies (no-op); replicating that here
  // would add noise. Revisit when real RLS policies land.
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("refresh_tokens");
};
