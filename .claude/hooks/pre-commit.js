#!/usr/bin/env node
// Vantage SRA — Claude Code PreToolUse hook.
// Fires on every Bash tool call. If the command is `git commit`, runs
// `make test` from the repo root first. Non-zero exit blocks the commit.

const { execSync } = require('child_process');
const path = require('path');

let payload;
try {
  payload = JSON.parse(require('fs').readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cmd = (payload && payload.tool_input && payload.tool_input.command) || '';

if (!/\bgit\s+commit\b/.test(cmd)) {
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '..', '..');

process.stderr.write('[pre-commit hook] git commit detected; running `make test`...\n');

try {
  execSync('make test', { stdio: 'inherit', cwd: repoRoot });
  process.stderr.write('[pre-commit hook] tests passed; allowing commit.\n');
  process.exit(0);
} catch {
  process.stderr.write('[pre-commit hook] `make test` failed. Commit blocked.\n');
  process.exit(2);
}
