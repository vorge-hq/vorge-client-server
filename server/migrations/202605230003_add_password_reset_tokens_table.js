exports.up = async function up(knex) {
  await knex.schema.createTable("password_reset_tokens", (table) => {
    table.uuid("id").primary();
    table.text("token_hash").notNullable().unique();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    table.timestamp("used_at");
    table.text("source_ip");
    table.text("user_agent");
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS password_reset_user_active_idx
      ON password_reset_tokens (user_id)
      WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS password_reset_expires_idx
      ON password_reset_tokens (expires_at)
      WHERE used_at IS NULL;
  `);

  // RLS intentionally NOT enabled, matching chunks 1 + 2. The initial schema
  // enables RLS on several tables without writing policies (effectively a
  // no-op); replicating that pattern here would add noise. Revisit when real
  // RLS policies land.
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("password_reset_tokens");
};
