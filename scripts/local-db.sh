#!/usr/bin/env bash
# Start a local Supabase (Postgres + Auth + REST) and load the NagrikSetu schema + data.
# No Supabase account needed. Requires Docker and the Supabase CLI
# (https://supabase.com/docs/guides/local-development/cli/getting-started).
#
#   scripts/local-db.sh          # start, apply SQL, print the .env lines to use
#   scripts/local-db.sh stop     # stop the stack
#
# Auth emails (sign-up OTP / confirmation) land in Inbucket: http://localhost:54324
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "stop" ]; then supabase stop; exit 0; fi

command -v supabase >/dev/null || { echo "Supabase CLI not found: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2; exit 1; }

supabase start

DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
FILES=(docs/SUPABASE_SETUP.sql)
while IFS= read -r f; do FILES+=("$f"); done < <(ls docs/migrations/*.sql | sort)
[ -f docs/demo-setup.sql ] && FILES+=(docs/demo-setup.sql)
FILES+=(docs/seed.sql)

run_sql() {
  if command -v psql >/dev/null; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$1"
  else
    docker exec -i "supabase_db_nagriksetu" psql -U postgres -v ON_ERROR_STOP=1 -q < "$1"
  fi
}

for f in "${FILES[@]}"; do echo "applying $f"; run_sql "$f"; done

eval "$(supabase status -o env 2>/dev/null | sed 's/^/export SB_/')"
cat <<OUT

Local Supabase is ready. Put these in .env at the repository root:

NAGRIKSETU_DISABLE_DB=0
NEXT_PUBLIC_SUPABASE_URL=${SB_API_URL:-http://127.0.0.1:54321}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SB_ANON_KEY:-<anon key from 'supabase status'>}
SUPABASE_SERVICE_ROLE_KEY=${SB_SERVICE_ROLE_KEY:-<service_role key from 'supabase status'>}

Run the app without docker compose for this mode (npm run start:backend, npm run dev:web):
containers cannot reach 127.0.0.1 on the host, and the browser and the server need the same URL.
OUT
