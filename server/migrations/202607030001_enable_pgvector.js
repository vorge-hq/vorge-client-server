// Enable the pgvector extension (P0 infra grounding; consumed from P4 —
// semantic library search embeddings). Idempotent and re-runnable.
//
// Availability caveat: the extension binary must be installed on the Postgres
// host. Supabase ships it (enable via dashboard or this migration). The local
// docker-compose image was switched to pgvector/pgvector:pg16 in the same
// change; containers created from the old postgres:16 image lack the
// extension, so this migration warns-and-continues locally instead of
// failing — nothing depends on the extension until P4.
exports.up = async function up(knex) {
  try {
    await knex.raw("CREATE EXTENSION IF NOT EXISTS vector;");
  } catch (error) {
    console.warn(
      `[migration 202607030001] pgvector unavailable on this host (${error.message}). ` +
        "Continuing — required from P4 onward; recreate the local db container " +
        "from pgvector/pgvector:pg16 or enable the extension in Supabase."
    );
  }
};

exports.down = async function down() {
  // Intentionally a no-op: dropping the extension would destroy any vector
  // columns/data created after P4. Removal, if ever needed, is a manual op.
};
