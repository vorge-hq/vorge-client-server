// P4 · O3 — semantic library search: add the pgvector embedding column to
// library_entries. The vector extension is enabled by 202607030001 (and the
// local db image is pgvector/pgvector). 1536 dims = openai/text-embedding-3-small
// (src/ai/config.js). The column is NULLABLE: embeddings are written async
// post-commit by the create/update pipeline, so a fresh row is briefly (or, on a
// gateway failure, indefinitely) unembedded — search simply skips NULL-embedding
// rows, and scripts/reembed-library.js backfills.
//
// No ANN index yet (ivfflat/hnsw): at seed/demo row counts an exact scan is well
// under the <500ms target, and a premature ivfflat index with too few rows hurts
// recall. Add one (and tune `lists`) when a facility's library grows large —
// tracked in the roadmap. RLS on library_entries (202607030002) already covers
// this column; no policy change needed.
exports.up = async function up(knex) {
  await knex.raw("ALTER TABLE library_entries ADD COLUMN IF NOT EXISTS embedding vector(1536)");
};

exports.down = async function down(knex) {
  await knex.raw("ALTER TABLE library_entries DROP COLUMN IF EXISTS embedding");
};
