// P4 · O3 — the semantic-search embedding pipeline. On library create/update the
// route fires scheduleEmbedding() AFTER the write commits (res "finish"), so a
// slow or failing gateway never blocks or fails the library write — the entry
// just stays unembedded until the next edit or a reembed-library.js run.
//
// The job opens its OWN facility scope (runInFacilityScope): it runs post-commit,
// outside any request scope, so runAiCall's budget reads and the setEmbedding
// UPDATE need their own GUC to pass RLS (the F2-ratified rule: a facility feature
// invoked outside a request must open a facility scope first).
const { runInFacilityScope } = require("../db/requestScope");
const { runAiCall } = require("./index");
const { setEmbedding } = require("../repositories/libraryRepository");
const env = require("../config/env");

// One embeddable string per entry: title + body. (Metadata is structured filter
// data, not prose — excluded so it doesn't skew similarity.)
function embeddingText({ title, body }) {
  return [title, body].filter(Boolean).join("\n\n");
}

// Embed one entry and store the vector, inside a fresh facility scope. THROWS on
// failure — the caller decides whether that's fatal (the search path lets it
// surface; the write pipeline swallows it). setEmbedding is guarded on the
// entry's current title/body, so a slower/older concurrent embed can't overwrite
// a newer one with a stale vector.
async function embedAndStore({ entryId, facilityId, title, body, userId, actingRole, traceId }) {
  await runInFacilityScope([facilityId], async () => {
    const { output } = await runAiCall({
      feature: "semantic_search",
      kind: "embedding",
      facilityId,
      userId,
      actingRole,
      traceId,
      value: embeddingText({ title, body })
    });
    await setEmbedding({ id: entryId, facilityId, embedding: output, title, body });
  });
}

// In-flight jobs, so tests (and any caller) can deterministically await
// completion via drainEmbeddings().
const pending = new Set();

// Fire-and-forget embedding for the create/update pipeline. Never throws, never
// blocks the write. No-op when AI is disabled (the write still succeeds; the
// column stays NULL until AI is enabled and reembed-library.js backfills).
//
// The job is registered in `pending` SYNCHRONOUSLY (before this returns), so a
// caller that schedules then awaits drainEmbeddings() can never race the
// registration. `waitFor` (the request's post-COMMIT signal — res "finish") is
// awaited INSIDE the job so the actual embedding still runs post-commit and the
// separate transaction sees the committed row.
function scheduleEmbedding(job) {
  if (!env.aiEnabled) {
    return;
  }
  const { waitFor, ...work } = job;
  const promise = Promise.resolve(waitFor)
    .then(() => embedAndStore(work))
    .catch((err) => {
      console.warn(`[library-embedding] failed for ${work.entryId} (leaving embedding null): ${err.message}`);
    })
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

// Test seam: await every in-flight embedding job.
async function drainEmbeddings() {
  await Promise.all([...pending]);
}

module.exports = { embeddingText, embedAndStore, scheduleEmbedding, drainEmbeddings };
