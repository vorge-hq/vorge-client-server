const path = require("path");
const os = require("os");

// Guards the 2026-07-03 dotenv-path fix: env.js / knexfile.js must resolve the
// repo-root .env from __dirname, NOT from process.cwd(). A cwd-relative path
// regressed silently (loaded nothing from server/), so seed/dev fell back to
// localhost. These tests fail if anyone reintroduces a cwd-relative path.

test("envPath is absolute", () => {
  const envPath = require("./envPath");
  expect(path.isAbsolute(envPath)).toBe(true);
});

test("envPath points at the repo-root .env", () => {
  const envPath = require("./envPath");
  // this test file lives at <repo>/server/src/config → three up is <repo>
  const expected = path.resolve(__dirname, "../../../.env");
  expect(envPath).toBe(expected);
  expect(envPath.endsWith(`${path.sep}.env`)).toBe(true);
});

test("envPath does not depend on cwd", () => {
  const expected = require("./envPath");
  const cwdBefore = process.cwd();
  process.chdir(os.tmpdir());
  try {
    delete require.cache[require.resolve("./envPath")];
    const reloaded = require("./envPath");
    expect(reloaded).toBe(expected);
  } finally {
    process.chdir(cwdBefore);
    delete require.cache[require.resolve("./envPath")];
  }
});
