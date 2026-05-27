exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.timestamp("mfa_enrolled_at");
    table.integer("mfa_failed_attempts").notNullable().defaultTo(0);
    table.timestamp("mfa_last_failure_at");
    table.timestamp("mfa_locked_until");
  });

  await knex.schema.alterTable("sessions", (table) => {
    table.boolean("mfa_satisfied").notNullable().defaultTo(false);
    table.boolean("must_reenroll").notNullable().defaultTo(false);
  });

  // Backfill existing sessions as mfa_satisfied=true so chunks 1-3 sessions
  // continue working after the migration. New chunk-4 sessions will compute
  // this at issue time.
  await knex("sessions").update({ mfa_satisfied: true });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("sessions", (table) => {
    table.dropColumn("must_reenroll");
    table.dropColumn("mfa_satisfied");
  });

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("mfa_locked_until");
    table.dropColumn("mfa_last_failure_at");
    table.dropColumn("mfa_failed_attempts");
    table.dropColumn("mfa_enrolled_at");
  });
};
