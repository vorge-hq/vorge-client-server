#!/usr/bin/env bash
set -euo pipefail

# scripts/test.sh
# ------------------------------------------------------------
# Runs the Vantage test suite.
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

echo "==> All tests completed"
