require("dotenv").config({ path: "../.env" });

const connection =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/vantage";

module.exports = {
  development: {
    client: "pg",
    connection,
    migrations: {
      directory: "./migrations"
    }
  },
  test: {
    client: "pg",
    connection: process.env.TEST_DATABASE_URL || connection,
    migrations: {
      directory: "./migrations"
    }
  },
  production: {
    client: "pg",
    connection,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: "./migrations"
    }
  }
};
