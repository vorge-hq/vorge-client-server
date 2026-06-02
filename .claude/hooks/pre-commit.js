#!/usr/bin/env node
// Vorge SRA — Claude Code PreToolUse hook.
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

  // Doc-update ritual reminder (non-blocking). If this commit touches
  // application code or migrations but doesn't update the diary or the
  // status map, nudge the author. Never blocks the commit.
  try {
    const staged = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    const touchesCode = staged.some(
      (f) =>
        f.startsWith('client/src') ||
        f.startsWith('server/src') ||
        f.startsWith('server/migrations')
    );
    const updatesDocs = staged.some(
      (f) => f === 'SESSION_LOG.md' || f === 'docs/production-status.md'
    );
    if (touchesCode && !updatesDocs) {
      process.stderr.write(
        '[pre-commit hook] WARNING: Consider updating SESSION_LOG.md and docs/production-status.md\n'
      );
    }
  } catch {
    // Best-effort reminder only; never block the commit on this check.
  }

  process.exit(0);
} catch {
  process.stderr.write('[pre-commit hook] `make test` failed. Commit blocked.\n');
  process.exit(2);
}
