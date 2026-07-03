const path = require("path");

// Absolute path to the repo-root .env, independent of process.cwd().
// env.js and knexfile.js historically used cwd-relative paths ("../../.env",
// "../.env") that only resolved by luck of the launch directory — from
// `server/` the env.js path pointed above the repo root and silently loaded
// nothing, so `npm run seed`/`dev` fell back to localhost defaults
// (see SESSION_LOG 2026-07-03). Resolving from __dirname fixes that.
// __dirname here is <repo>/server/src/config → three levels up is <repo>.
module.exports = path.resolve(__dirname, "../../../.env");
