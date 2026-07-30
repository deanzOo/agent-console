#!/usr/bin/env bash
# Boots the built app and checks it actually serves.
#
# Exists because a middleware runtime bug once made every request 500 while
# typecheck, lint, the full test suite and `next build` all passed. Nothing
# short of starting the server catches that class of failure.
set -uo pipefail

cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-3999}"
DATA="$(mktemp -d)"
LOG="$DATA/app.log"
APP=""

cleanup() {
  [ -n "$APP" ] && kill "$APP" 2>/dev/null
  rm -rf "$DATA"
}
trap cleanup EXIT

if [ ! -d .next ]; then
  echo "smoke: no .next — run 'npm run build' first" >&2
  exit 1
fi

AUTH_MODE=trusted-network \
DATA_DIR="$DATA" \
WORKSPACE_ROOT="$DATA/work" \
HOST=127.0.0.1 \
PORT="$PORT" \
  npx next start -p "$PORT" > "$LOG" 2>&1 &
APP=$!

for _ in $(seq 1 45); do
  curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/setup" 2>/dev/null && break
  if ! kill -0 "$APP" 2>/dev/null; then
    echo "smoke: server exited during startup" >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 1
done

failed=0
check() {
  local path="$1" expected="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$PORT$path")"
  if [ "$code" = "$expected" ]; then
    printf '  ok    %-22s %s\n' "$path" "$code"
  else
    printf '  FAIL  %-22s got=%s want=%s\n' "$path" "$code" "$expected"
    failed=1
  fi
}

# A fresh install has no setup marker, so the dashboard redirects to the wizard.
check /              307
check /setup         200
check /api/missions  200
check /login         200

# The whole class of bug this guards against shows up in the log even when a
# status code happens to look sane.
if grep -qiE "Native module not found|Failed to load external module|Internal Server Error" "$LOG"; then
  echo "  FAIL  server logged a module/runtime error:" >&2
  grep -iE "Native module not found|Failed to load external module|Internal Server Error" "$LOG" | head -5 >&2
  failed=1
fi

[ "$failed" -eq 0 ] && echo "smoke: app boots and serves" || echo "smoke: FAILED"
exit "$failed"
