const knex = require("knex");
const env = require("../config/env");

const db = knex({
  client: "pg",
  connection: env.databaseUrl
});

module.exports = db;
