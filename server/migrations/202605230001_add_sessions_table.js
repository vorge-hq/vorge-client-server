exports.up = async function up(knex) {
  await knex.schema.createTable("sessions", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("acting_role").notNullable();
    table.uuid("facility_id").references("id").inTable("facilities").onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    table.timestamp("revoked_at");
    table.text("source_ip");
    table.text("user_agent");
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS sessions_user_active_idx
      ON sessions (user_id)
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS sessions_expires_idx
      ON sessions (expires_at)
      WHERE revoked_at IS NULL;
  `);

  // RLS intentionally NOT enabled. The initial schema enables RLS on several
  // tables without writing policies (effectively a no-op); replicating that
  // pattern here would add noise without value. Revisit when policies land.
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sessions");
};
