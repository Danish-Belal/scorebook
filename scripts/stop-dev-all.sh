#!/usr/bin/env bash
# Stop ScoreBook dev stack: Next (3000), API (3001), ts-node-dev workers.
# Run from repo root: npm run stop:all

set +e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$(basename "$ROOT")"
echo "Stopping ScoreBook dev processes (repo: $MARKER)…"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null
    echo "  Freed port $port (PIDs: $pids)"
  fi
}

kill_port 3000
kill_port 3001

# Workers and API don't listen on 3000/3001 — match this repo folder name in the process command line
pkill -f "ts-node-dev.*${MARKER}.*src/workers/fetchWorker" 2>/dev/null && echo "  Stopped fetch worker"
pkill -f "ts-node-dev.*${MARKER}.*src/workers/scoreWorker" 2>/dev/null && echo "  Stopped score worker"
pkill -f "ts-node-dev.*${MARKER}.*src/workers/refreshWorker" 2>/dev/null && echo "  Stopped refresh worker"
pkill -f "ts-node-dev.*${MARKER}.*src/index.ts" 2>/dev/null && echo "  Stopped API (ts-node-dev)"

# concurrently wrapper (optional)
pkill -f "concurrently.*api,fetch,score,refresh,web" 2>/dev/null && echo "  Stopped concurrently dev:all"

# Next.js dev server (if path didn’t match above)
pkill -f "next dev.*scorebook-frontend" 2>/dev/null && echo "  Stopped next dev (pattern)"

echo "Done. Start again with: npm run dev:all"
exit 0
