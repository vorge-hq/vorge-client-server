#!/usr/bin/env bash
# scripts/lib/load-env.sh
# ------------------------------------------------------------
# Source KEY=VALUE env files into the current shell.
# Usage (from another script after setting ROOT_DIR):
#   source "${ROOT_DIR}/scripts/lib/load-env.sh"
#   load_env_file "${ROOT_DIR}/.env"
#   load_env_file "${ROOT_DIR}/.env.staging"   # later file wins
#
# Skips blank lines and comments. Does not print values.
# ------------------------------------------------------------

load_env_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo "ERROR: env file not found: ${file}" >&2
    return 1
  fi
  local line key value
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
    if [[ "${line}" =~ ^[[:space:]]*export[[:space:]]+ ]]; then
      line="${line#*export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi
    [[ "${line}" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "${key}=${value}"
  done < "${file}"
}

# Host-side scripts cannot resolve Docker Compose's `db` hostname.
# Rewrite to localhost when running on the laptop (not inside a container).
rewrite_compose_db_host_for_host_shell() {
  if [[ -f /.dockerenv ]]; then
    return 0
  fi
  if [[ -n "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="${DATABASE_URL//@db:/@localhost:}"
  fi
  if [[ -n "${MIGRATE_DATABASE_URL:-}" ]]; then
    export MIGRATE_DATABASE_URL="${MIGRATE_DATABASE_URL//@db:/@localhost:}"
  fi
}

# Refuse accidental writes to a managed/staging host unless explicitly targeted.
assert_db_target() {
  local expected="$1" # "local" | "staging"
  local url="${MIGRATE_DATABASE_URL:-${DATABASE_URL:-}}"
  local host=""
  if [[ "${url}" =~ @([^/:?]+) ]]; then
    host="${BASH_REMATCH[1]}"
  fi
  case "${expected}" in
    local)
      if [[ "${host}" == *supabase.com* || "${host}" == *render.com* ]]; then
        echo "ERROR: refusing to run against remote host '${host}'." >&2
        echo "  Local commands use repo-root .env only (Docker DB)." >&2
        echo "  For staging: make migrate-staging / make seed-staging" >&2
        return 1
      fi
      ;;
    staging)
      if [[ "${host}" != *supabase.com* ]]; then
        echo "ERROR: staging target expected a supabase.com host; got '${host:-none}'." >&2
        echo "  Put staging URLs in .env.staging (not in .env)." >&2
        return 1
      fi
      ;;
    *)
      echo "ERROR: assert_db_target: unknown expected=${expected}" >&2
      return 1
      ;;
  esac
  echo "==> DB host: ${host:-unknown} (target=${expected})"
}

confirm_staging() {
  if [[ "${CONFIRM_STAGING:-}" == "yes" || "${1:-}" == "-y" ]]; then
    return 0
  fi
  echo ""
  echo "⚠️  This will run against STAGING (shared Supabase)."
  read -r -p "Type 'staging' to continue: " answer
  if [[ "${answer}" != "staging" ]]; then
    echo "Aborted."
    return 1
  fi
}
