#!/usr/bin/env bash
set -euo pipefail

# scripts/migrate.sh
# ------------------------------------------------------------
# Controlled database migration runner for Vorge.
#
# Migrations are explicit.
# This script should be safe to call when migrations are idempotent.
#
# Do not put destructive database reset logic here.
# If destructive reset is ever needed for local development, create a
# separate clearly named script such as:
#
#   scripts/reset-local-db.sh
#
# and require explicit confirmation.
# ------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "==> Running database migrations"

if [[ ! -d "server" || ! -f "server/package.json" ]]; then
  echo "ERROR: server/package.json not found"
  exit 1
fi

if npm --prefix server run | grep -q "migrate"; then
  npm --prefix server run migrate
else
  echo "ERROR: No server migrate script found in server/package.json"
  echo "Add a migrate script before running migrations."
  exit 1
fi

echo "==> Migrations completed"
