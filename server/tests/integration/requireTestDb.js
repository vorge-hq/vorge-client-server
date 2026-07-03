// Integration tests run against a REAL Postgres (never mocked, never the
// Supabase staging DB — they truncate tables). Fail loudly if the URL is
// missing so isolation tests can never be silently skipped.
function requireTestDbUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "\n\nTEST_DATABASE_URL is required for integration tests but is not set.\n" +
        "Start the local database and point at a throwaway test DB, e.g.:\n" +
        "  make start   # or: docker compose up -d db\n" +
        "  docker exec vantage-db psql -U postgres -c 'CREATE DATABASE vorge_test TEMPLATE template0'\n" +
        "  export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test\n" +
        "Never point this at Supabase/staging — the suite truncates tables.\n"
    );
  }
  return url;
}

module.exports = { requireTestDbUrl };
