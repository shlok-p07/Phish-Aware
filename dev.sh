#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Local dev launcher for PhishAware (Next.js + Postgres).
#
# Usage:
#   ./dev.sh          # start Postgres (if needed), push schema, seed, run Next
#   ./dev.sh stop     # stop the Next dev server started by this script
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DB_NAME="phishaware"
export DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/${DB_NAME}}"

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

# --- Postgres (Homebrew) ---------------------------------------------------
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
export PATH="$PG_BIN:$PATH"
if ! pg_isready -q 2>/dev/null; then
  echo "Starting postgresql@16..."
  brew services start postgresql@16 >/dev/null
  for _ in $(seq 1 15); do pg_isready -q && break; sleep 1; done
fi
if ! psql -lqt 2>/dev/null | cut -d '|' -f1 | grep -qw "$DB_NAME"; then
  echo "Creating database $DB_NAME..."
  createdb "$DB_NAME"
fi

# --- Schema + seed (idempotent) --------------------------------------------
echo "Pushing DB schema..."
bun run db:push >/dev/null
echo "Seeding (if empty)..."
bun run db:seed

# --- Next.js ---------------------------------------------------------------
echo "Starting Next.js dev server..."
bun run dev > "$LOG_DIR/next.log" 2>&1 &
echo $! > "$PID_FILE"

for _ in $(seq 1 30); do
  grep -qE "Ready in" "$LOG_DIR/next.log" && break
  sleep 1
done

echo ""
echo "  ✅ PhishAware (Next.js) is running"
echo "     App:  http://localhost:3000/"
echo "     Logs: $LOG_DIR/next.log"
echo ""
echo "  Stop with:  ./dev.sh stop"
