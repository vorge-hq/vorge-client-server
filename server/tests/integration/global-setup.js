const path = require("path");
const knexLib = require("knex");
const { requireTestDbUrl } = require("./requireTestDb");

// Runs once before the integration suite: bring the test DB schema to latest.
// Migrations are idempotent, so re-running across sessions is safe.
module.exports = async () => {
  const url = requireTestDbUrl();
  const knex = knexLib({
    client: "pg",
    connection: { connectionString: url, ssl: false },
    migrations: { directory: path.join(__dirname, "../../migrations") }
  });
  try {
    await knex.migrate.latest();
  } finally {
    await knex.destroy();
  }
};
