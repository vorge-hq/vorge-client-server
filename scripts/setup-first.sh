#!/usr/bin/env bash
set -euo pipefail

# scripts/setup-first.sh
# ------------------------------------------------------------
# First-time local/dev setup for Vantage.
#
# This script may run migrations and safe initialization steps.
# It must avoid destructive actions unless explicitly confirmed.
#
# Normal day-to-day builds should NOT call this script unless the
# developer intentionally runs:
#
#   make setup-first
#   make build-first
# ------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "==> First-time setup started"

if [[ ! -f ".env" ]]; then
  echo "ERROR: .env file not found."
  echo "Create one from .env.example:"
  echo "  cp .env.example .env"
  exit 1
fi

echo "==> Starting required infrastructure services"
docker compose up -d db

echo "==> Waiting for database to be ready"
MAX_RETRIES=30
COUNT=0
until docker compose exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; do
  COUNT=$((COUNT + 1))
  if [[ "${COUNT}" -ge "${MAX_RETRIES}" ]]; then
    echo "ERROR: Database did not become ready in time"
    exit 1
  fi
  sleep 2
done

echo "==> Database is ready"
echo "==> Running migrations"
./scripts/migrate.sh

echo "==> Running safe seed/init scripts if configured"
if [[ -d "server" && -f "server/package.json" ]]; then
  if npm --prefix server run | grep -q "seed"; then
    npm --prefix server run seed
  else
    echo "==> No seed script found; skipping"
  fi
fi

echo "==> First-time setup completed successfully"
