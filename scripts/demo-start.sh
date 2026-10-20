#!/usr/bin/env bash
# Starts the whole NagrikSetu demo natively (no docker): audit :8787, backend :8000, web :3000.
# Run `npm run demo:setup` first. Ctrl-C stops everything. Logs: ./.demo-logs/
set -u
cd "$(dirname "$0")/.."
ROOT="$PWD"
LOGS="$ROOT/.demo-logs"
mkdir -p "$LOGS"

need() { [ -f "$1" ] || { echo "Missing $1 - run: npm run demo:setup" >&2; exit 1; }; }
need packages/web/.env.local; need backend/.env; need packages/audit/.env

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22+ is required (backend runs TypeScript directly). Found $(node -v)." >&2; exit 1
fi

[ -d node_modules ] || { echo "== npm install"; npm install || exit 1; }

echo "== building packages (agents, documents, audit)"
for ws in packages/agents packages/documents packages/audit; do
  npm run build --workspace "$(node -p "require('./$ws/package.json').name")" >"$LOGS/build-$(basename $ws).log" 2>&1 \
    || { echo "Build failed for $ws, see $LOGS/build-$(basename $ws).log" >&2; exit 1; }
done

if [ ! -f packages/web/.next/BUILD_ID ] || [ "${DEMO_REBUILD:-0}" = "1" ]; then
  echo "== building web (first run takes a minute)"
  npm run build --workspace web >"$LOGS/build-web.log" 2>&1 \
    || { echo "Web build failed, see $LOGS/build-web.log" >&2; exit 1; }
fi

PIDS=()
cleanup() {
  echo; echo "Stopping demo..."
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# The audit service does not read .env itself, so export its file into its environment.
( set -a; . packages/audit/.env; set +a; cd packages/audit && exec node dist/cli.js serve ) >"$LOGS/audit.log" 2>&1 &
PIDS+=($!)
( cd backend && exec npm run start ) >"$LOGS/backend.log" 2>&1 &
PIDS+=($!)
( cd packages/web && exec npx next start -p 3000 ) >"$LOGS/web.log" 2>&1 &
PIDS+=($!)

wait_for() { # name url
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null "$2" 2>/dev/null && { echo "  ok   $1  $2"; return 0; }
    sleep 1
  done
  echo "  FAIL $1 did not come up; see $LOGS/" >&2; return 1
}

echo "== waiting for services"
FAILED=0
wait_for audit   http://127.0.0.1:8787/health || FAILED=1
wait_for backend http://127.0.0.1:8000/health || FAILED=1
wait_for web     http://localhost:3000/       || FAILED=1
[ "$FAILED" = 0 ] || { cleanup; }

cat <<MSG

NagrikSetu demo is up
  Web      http://localhost:3000   (sign in at /auth/signin)
  Backend  http://localhost:8000/health
  Audit    http://127.0.0.1:8787/health
  Logs     $LOGS/
Sign-in code:  npm run demo:otp -- you@example.com --profile
Ctrl-C to stop.
MSG
wait
