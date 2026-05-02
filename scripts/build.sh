#!/usr/bin/env bash
set -euo pipefail

# scripts/build.sh
# ------------------------------------------------------------
# Owns the actual Vantage build process.
#
# This script is intentionally separate from the Makefile.
#
# Responsibility:
# - run mandatory tests
# - enforce test coverage
# - fail fast if tests fail
# - build Docker artifacts/images only after tests pass
# - optionally run first-time setup workflow when --first is passed
#
# Rule:
# Deployable artifacts must never be produced if core unit tests fail.
# ------------------------------------------------------------

MODE="normal"
if [[ "${1:-}" == "--first" ]]; then
  MODE="first"
fi

echo "==> Vantage build started"
echo "==> Mode: ${MODE}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f ".env" ]]; then
  echo "ERROR: .env file not found."
  echo "Create one from .env.example before building:"
  echo "  cp .env.example .env"
  exit 1
fi

echo "==> Installing dependencies"
if [[ -d "server" && -f "server/package.json" ]]; then
  echo "==> Installing server dependencies"
  npm --prefix server ci
fi

if [[ -d "client" && -f "client/package.json" ]]; then
  echo "==> Installing client dependencies"
  npm --prefix client ci
fi

echo "==> Running mandatory tests"
./scripts/test.sh
echo "==> Tests passed"

if [[ "${MODE}" == "first" ]]; then
  echo "==> Running first-time setup workflow"
  ./scripts/setup-first.sh
else
  echo "==> Skipping first-time setup for normal build"
fi

echo "==> Building Docker images/artifacts"
docker compose build
echo "==> Build completed successfully"
