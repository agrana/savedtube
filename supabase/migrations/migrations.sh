#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.local.db"

if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
else
  echo "Missing $ENV_FILE"; exit 1
fi

case "${1:-}" in
  init)
    supabase init
    ;;
  new)
    supabase migration new "$2"
    ;;
  push-stg)
    supabase db push --db-url "$SUPABASE_DB_URL_STAGING"
    ;;
  push-prod)
    read -p "Push to prod? (y/N) " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] && supabase db push --db-url "$SUPABASE_DB_URL_PROD"
    ;;
  dump-stg)
    supabase db dump --db-url "$SUPABASE_DB_URL_STAGING" --schema-only > db/schema.staging.sql
    ;;
  dump-prod)
    supabase db dump --db-url "$SUPABASE_DB_URL_PROD" --schema-only > db/schema.prod.sql
    ;;
  *)
    echo "Usage: $0 {init|new <name>|push-stg|push-prod|dump-stg|dump-prod}"
    ;;
esac
