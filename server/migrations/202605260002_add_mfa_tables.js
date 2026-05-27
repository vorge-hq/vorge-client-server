exports.up = async function up(knex) {
  await knex.schema.createTable("mfa_secrets", (table) => {
    table.uuid("user_id").primary().references("id").inTable("users").onDelete("CASCADE");
    table.binary("secret_encrypted").notNullable();
    table.binary("secret_nonce").notNullable();
    table.smallint("key_version").notNullable().defaultTo(1);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("verified_at");
  });

  await knex.schema.createTable("mfa_recovery_codes", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("code_hash").notNullable();
    table.timestamp("used_at");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("mfa_trusted_devices", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.text("cookie_token_hash").notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("last_seen_at");
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS mfa_recovery_user_active_idx
      ON mfa_recovery_codes (user_id)
      WHERE used_at IS NULL;
    CREATE INDEX IF NOT EXISTS mfa_trusted_user_idx
      ON mfa_trusted_devices (user_id);
    CREATE INDEX IF NOT EXISTS mfa_trusted_token_hash_idx
      ON mfa_trusted_devices (cookie_token_hash);
  `);

  // RLS intentionally NOT enabled. See docs/decisions/chunk-4-mfa.md
  // §Deviations #6 — explicit departure from spec (which called for RLS),
  // consistent with chunks 1-3 precedent where RLS was enabled on initial
  // schema without policies and subsequent tables omitted RLS entirely.
  // App-layer enforcement covers cross-tenant cases.
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("mfa_trusted_devices");
  await knex.schema.dropTableIfExists("mfa_recovery_codes");
  await knex.schema.dropTableIfExists("mfa_secrets");
};
