exports.up = async function up(knex) {
  await knex.schema.createTable("operators", (table) => {
    table.uuid("id").primary();
    table.text("name").notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable("facilities", (table) => {
    table.uuid("id").primary();
    table.uuid("operator_id").notNullable().references("id").inTable("operators").onDelete("CASCADE");
    table.text("name").notNullable();
    table.jsonb("configuration").notNullable().defaultTo("{}");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("users", (table) => {
    table.uuid("id").primary();
    table.text("email").notNullable().unique();
    table.text("password_hash").notNullable();
    table.text("name").notNullable();
    table.boolean("mfa_enabled").notNullable().defaultTo(false);
    table.timestamps(true, true);
  });

  await knex.schema.createTable("role_assignments", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    table.uuid("facility_id").references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("operator_id").notNullable().references("id").inTable("operators").onDelete("CASCADE");
    table.text("role").notNullable();
    table.boolean("cross_facility").notNullable().defaultTo(false);
    table.timestamps(true, true);
    table.index(["user_id", "facility_id", "role"]);
  });

  await knex.schema.createTable("assessments", (table) => {
    table.uuid("id").primary();
    table.uuid("operator_id").notNullable().references("id").inTable("operators").onDelete("CASCADE");
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("lead_author_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.text("name").notNullable();
    table.text("state").notNullable().defaultTo("Draft");
    table.integer("lock_version").notNullable().defaultTo(1);
    table.jsonb("contributors").notNullable().defaultTo("[]");
    table.timestamps(true, true);
    table.index(["facility_id", "state"]);
  });

  await knex.schema.createTable("assets", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.text("name").notNullable();
    table.text("asset_type");
    table.text("criticality");
    table.jsonb("details").notNullable().defaultTo("{}");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("threats", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.text("name").notNullable();
    table.integer("likelihood");
    table.jsonb("details").notNullable().defaultTo("{}");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("asset_threat_links", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.uuid("asset_id").notNullable().references("id").inTable("assets").onDelete("CASCADE");
    table.uuid("threat_id").notNullable().references("id").inTable("threats").onDelete("CASCADE");
    table.boolean("enabled").notNullable().defaultTo(false);
    table.timestamps(true, true);
    table.unique(["asset_id", "threat_id"]);
  });

  await knex.schema.createTable("evaluations", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.uuid("asset_id").notNullable().references("id").inTable("assets").onDelete("CASCADE");
    table.uuid("threat_id").notNullable().references("id").inTable("threats").onDelete("CASCADE");
    table.text("scenario").notNullable().defaultTo("");
    table.text("controls").notNullable().defaultTo("");
    table.text("vulnerabilities").notNullable().defaultTo("");
    table.text("proposed_mitigation").notNullable().defaultTo("");
    table.jsonb("r1").notNullable().defaultTo("{}");
    table.jsonb("r2").notNullable().defaultTo("{}");
    table.timestamps(true, true);
    table.unique(["asset_id", "threat_id"]);
  });

  await knex.schema.createTable("mitigations", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.uuid("evaluation_id").notNullable().references("id").inTable("evaluations").onDelete("CASCADE");
    table.uuid("owner_user_id").references("id").inTable("users").onDelete("SET NULL");
    table.text("owner_role_label");
    table.text("description").notNullable();
    table.text("severity");
    table.text("agreed").notNullable().defaultTo("Pending");
    table.date("target_date");
    table.text("status").notNullable().defaultTo("Open");
    table.timestamps(true, true);
  });

  await knex.schema.createTable("mitigation_progress_logs", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("mitigation_id").notNullable().references("id").inTable("mitigations").onDelete("CASCADE");
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("RESTRICT");
    table.text("from_status");
    table.text("to_status");
    table.text("note").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("audit_log_entries", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("RESTRICT");
    table.uuid("assessment_id").references("id").inTable("assessments").onDelete("SET NULL");
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("RESTRICT");
    table.text("acting_role").notNullable();
    table.text("action_type").notNullable();
    table.text("entity_type").notNullable();
    table.uuid("entity_id");
    table.jsonb("diff");
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.text("trace_id").notNullable();
    table.text("previous_hash");
    table.text("hash").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["facility_id", "assessment_id", "action_type"]);
  });

  await knex.schema.createTable("versions", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.uuid("assessment_id").notNullable().references("id").inTable("assessments").onDelete("CASCADE");
    table.integer("version_number").notNullable();
    table.jsonb("assessment_snapshot").notNullable();
    table.jsonb("configuration_snapshot").notNullable();
    table.timestamp("approved_at").notNullable();
  });

  await knex.schema.createTable("library_entries", (table) => {
    table.uuid("id").primary();
    table.uuid("facility_id").notNullable().references("id").inTable("facilities").onDelete("CASCADE");
    table.text("type").notNullable();
    table.text("title").notNullable();
    table.text("body").notNullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamps(true, true);
  });

  await knex.raw(`
    ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE threats ENABLE ROW LEVEL SECURITY;
    ALTER TABLE asset_threat_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE mitigations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE audit_log_entries ENABLE ROW LEVEL SECURITY;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("library_entries");
  await knex.schema.dropTableIfExists("versions");
  await knex.schema.dropTableIfExists("audit_log_entries");
  await knex.schema.dropTableIfExists("mitigation_progress_logs");
  await knex.schema.dropTableIfExists("mitigations");
  await knex.schema.dropTableIfExists("evaluations");
  await knex.schema.dropTableIfExists("asset_threat_links");
  await knex.schema.dropTableIfExists("threats");
  await knex.schema.dropTableIfExists("assets");
  await knex.schema.dropTableIfExists("assessments");
  await knex.schema.dropTableIfExists("role_assignments");
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("facilities");
  await knex.schema.dropTableIfExists("operators");
};
