#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Local dev launcher for PhishAware (Next.js + MongoDB).
#
# Usage:
#   ./scripts/dev.sh          # verify Mongo connectivity, apply schema + seed, run Next
#   ./scripts/dev.sh stop     # stop the Next dev server started by this script
#
# MONGODB_URI must already be set in .env -- either a MongoDB Atlas
# connection string, or a MongoDB instance you run yourself (docker-compose.yml
# only runs the app; it does not provide a database).
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
PID_FILE="$LOG_DIR/next.pid"

stop() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "stopped pid $pid"
    fi
    rm -f "$PID_FILE"
  fi
  pkill -f "next dev" 2>/dev/null || true
}

if [ "${1:-}" = "stop" ]; then
  stop
  exit 0
fi
stop 2>/dev/null || true

# --- MongoDB connectivity ---------------------------------------------------
if [ ! -f .env ] || ! grep -q "^MONGODB_URI=" .env; then
  echo "MONGODB_URI is not set in .env." >&2
  echo "Point it at a MongoDB Atlas cluster or a MongoDB instance you run yourself." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a
if command -v mongosh >/dev/null 2>&1; then
  if ! mongosh "$MONGODB_URI" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    echo "Could not reach MongoDB at MONGODB_URI. Is it running/reachable?" >&2
    exit 1
  fi
fi

# --- Schema + seed (idempotent) --------------------------------------------
# db:seed connects through getDb(), which applies the app's own schema
# (src/db/provision.ts) before seeding. This deliberately no longer runs
# `db:init`: the mongosh scripts in database/init/ have drifted from
# provision.ts, and applying them to a shared cluster replaces its validators
# with older ones until the next server restart.
echo "Applying schema and seeding (if empty)..."
bun run db:seed

# --- Next.js ---------------------------------------------------------------
echo "Starting Next.js dev server..."
bun run dev > "$LOG_DIR/next.log" 2>&1 &
echo $! > "$PID_FILE"

for _ in $(seq 1 30); do
  grep -qE "Ready in" "$LOG_DIR/next.log" && break; sleep 1
done

echo ""
echo "  ✅ PhishAware (Next.js) is running"
echo "     App:  http://localhost:3000/"
echo "     Logs: $LOG_DIR/next.log"
echo ""
echo "  Stop with:  ./scripts/dev.sh stop"
