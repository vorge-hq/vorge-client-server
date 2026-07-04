// P4 · O3 — bulk re-embed library entries. Run after an embedding-model change,
// bulk content edits, or to backfill entries created while AI was disabled.
//
//   node scripts/reembed-library.js            # re-embed every entry
//   node scripts/reembed-library.js --missing  # only entries with a NULL embedding
//
// Requires AI_ENABLED=true and AI_GATEWAY_API_KEY. Runs as the DB owner (base
// pool); embedAndStore opens a per-facility scope so the writes carry the GUC.
const db = require("../src/db/knex");
const { runInFacilityScope } = require("../src/db/requestScope");
const { listEntriesForEmbedding } = require("../src/repositories/libraryRepository");
const { embedAndStore } = require("../src/ai/libraryEmbedding");

async function main() {
  const onlyMissing = process.argv.includes("--missing");
  const facilities = await db("facilities").select("id", "name");
  let embedded = 0;
  let failed = 0;

  for (const facility of facilities) {
    // Scope the driving read so it returns rows even under the non-owner app
    // role (RLS default-denies an unscoped read → a silent empty backfill).
    const entries = await runInFacilityScope([facility.id], () =>
      listEntriesForEmbedding({ facilityId: facility.id, onlyMissing })
    );
    for (const entry of entries) {
      try {
        await embedAndStore({
          entryId: entry.id,
          facilityId: facility.id,
          title: entry.title,
          body: entry.body,
          userId: "system",
          actingRole: null,
          traceId: `reembed-${entry.id}`
        });
        embedded += 1;
      } catch (err) {
        failed += 1;
        console.error(`[reembed] ${entry.id} (${facility.name}) failed: ${err.message}`);
      }
    }
  }

  console.log(`[reembed] done — ${embedded} embedded, ${failed} failed${onlyMissing ? " (missing-only)" : ""}`);
}

main()
  .then(() => db.destroy())
  .catch(async (err) => {
    console.error(err);
    await db.destroy();
    process.exit(1);
  });
