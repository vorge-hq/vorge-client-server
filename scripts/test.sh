#!/usr/bin/env bash
set -euo pipefail

# scripts/test.sh
# ------------------------------------------------------------
# Runs the Vorge test suite.
#
# Unit tests for core application logic are mandatory.
# The build process calls this script before producing artifacts.
#
# Coverage target:
# - Aim for near-100% coverage on core business logic.
# - Do not allow critical workflow, permission, or state-machine
#   logic to be untested.
# ------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "==> Running server tests"
if [[ -d "server" && -f "server/package.json" ]]; then
  npm --prefix server test -- --coverage
else
  echo "ERROR: server/package.json not found"
  exit 1
fi

echo "==> Running client tests"
if [[ -d "client" && -f "client/package.json" ]]; then
  npm --prefix client test -- --coverage --run
else
  echo "WARNING: client/package.json not found; skipping client tests"
fi

# Integration tests need a REAL throwaway Postgres (TEST_DATABASE_URL). They
# are the tenant-isolation gate (docs/test-specs.md §P2). Run them when a test
# DB is configured; otherwise WARN loudly (never a silent skip) so it is
# obvious the isolation suite did not run. Run them explicitly before shipping:
#   make start && export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vorge_test
#   npm --prefix server run test:integration
echo "==> Running server integration tests"
if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  npm --prefix server run test:integration
else
  echo "############################################################"
  echo "WARNING: TEST_DATABASE_URL not set — integration/tenant-isolation"
  echo "tests DID NOT RUN. These are the P2 security gate. Run them with a"
  echo "local test DB before relying on this pass. See docs/test-specs.md §P2."
  echo "############################################################"
fi

echo "==> All tests completed"
