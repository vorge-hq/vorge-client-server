#!/usr/bin/env bash
set -euo pipefail

# scripts/seed.sh
# ------------------------------------------------------------
# Seed the database (idempotent upsert demo data).
#
# Default: local Docker DB via repo-root `.env` only.
# Staging:  make seed-staging  (loads `.env` then `.env.staging`)
# ------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
# shellcheck source=lib/load-env.sh
source "${ROOT_DIR}/scripts/lib/load-env.sh"

TARGET="${VORGE_TARGET:-local}"

if [[ ! -d "server" || ! -f "server/package.json" ]]; then
  echo "ERROR: server/package.json not found"
  exit 1
fi

load_env_file "${ROOT_DIR}/.env"
if [[ "${TARGET}" == "staging" ]]; then
  load_env_file "${ROOT_DIR}/.env.staging"
  confirm_staging "${1:-}"
else
  rewrite_compose_db_host_for_host_shell
fi

assert_db_target "${TARGET}"

echo "==> Seeding database (target=${TARGET})"
npm --prefix server run seed
echo "==> Seed completed"
