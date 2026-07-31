#!/usr/bin/env bash
# Boots the built app and checks it actually serves.
#
# Exists because a middleware runtime bug once made every request 500 while
# typecheck, lint, the full test suite and `next build` all passed. Nothing
# short of starting the server catches that class of failure.
#
# Runs once per AUTH_MODE that has a distinct request path. A single mode is not
# enough: password mode was once completely unable to authenticate while the
# trusted-network run stayed green, because the two share no gate at all.
set -uo pipefail
# Job control, so the server gets its own process group and cleanup can signal
# the whole tree rather than only the process bash happens to know the pid of.
set -m

cd "$(dirname "$0")/.."

APP_DIR="apps/web"
AGENTD_PORT="${SMOKE_AGENTD_PORT:-3998}"
PORT="${SMOKE_PORT:-3999}"
STARTUP_TIMEOUT_SECONDS=45
BASE="http://127.0.0.1:$PORT"
# Long enough to satisfy the wizard's own minimum, which rejects short input.
TEST_PASSWORD="smoke-test-password"

DATA=""
APP=""
AGENTD=""
failed=0

cleanup() {
  [ -n "$APP" ] && kill -- "-$APP" 2>/dev/null
  [ -n "$AGENTD" ] && kill -- "-$AGENTD" 2>/dev/null
  [ -n "$DATA" ] && rm -rf "$DATA"
}
trap cleanup EXIT

# Build output lives in the web package, not the repository root.
if [ ! -d "$APP_DIR/.next" ]; then
  echo "smoke: no $APP_DIR/.next — run 'npm run build' first" >&2
  exit 1
fi

# Each leg gets an empty data dir, so "fresh install" means what it says.
start_app() {
  local mode="$1"
  DATA="$(mktemp -d)"
  LOG="$DATA/app.log"

  # The deployment runs both processes; a console with no session host would
  # pass every check here and be unable to run a single mission.
  AUTH_MODE="$mode" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  DATA_DIR="$DATA" \
  WORKSPACE_ROOT="$DATA/work" \
  AGENTD_PORT="$AGENTD_PORT" \
    node apps/agentd/dist/server.mjs > "$DATA/agentd.log" 2>&1 &
  AGENTD=$!

  AUTH_MODE="$mode" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  DATA_DIR="$DATA" \
  WORKSPACE_ROOT="$DATA/work" \
  HOST=127.0.0.1 \
  PORT="$PORT" \
  AGENTD_PORT="$AGENTD_PORT" \
    ./node_modules/.bin/next start "$APP_DIR" -p "$PORT" > "$LOG" 2>&1 &
  APP=$!

  local ready=0
  for _ in $(seq 1 "$STARTUP_TIMEOUT_SECONDS"); do
    if curl -sf -o /dev/null --max-time 2 "$BASE/login" 2>/dev/null; then
      ready=1
      break
    fi
    if ! kill -0 "$APP" 2>/dev/null; then
      echo "smoke: server exited during startup ($mode)" >&2
      cat "$LOG" >&2
      exit 1
    fi
    sleep 1
  done

  if [ "$ready" -ne 1 ]; then
    echo "smoke: server did not answer within ${STARTUP_TIMEOUT_SECONDS}s ($mode)" >&2
    cat "$LOG" >&2
    exit 1
  fi
}

stop_app() {
  # The whole class of bug this guards against shows up in the log even when a
  # status code happens to look sane.
  if grep -qiE "Native module not found|Failed to load external module|Internal Server Error" "$LOG"; then
    echo "  FAIL  server logged a module/runtime error:" >&2
    grep -iE "Native module not found|Failed to load external module|Internal Server Error" "$LOG" | head -5 >&2
    failed=1
  fi
  kill -- "-$APP" 2>/dev/null
  wait "$APP" 2>/dev/null
  APP=""
  [ -n "$AGENTD" ] && kill -- "-$AGENTD" 2>/dev/null
  AGENTD=""
  rm -rf "$DATA"
  DATA=""
}

check() {
  local path="$1" expected="$2" label="${3:-}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$path")"
  report "$code" "$expected" "${label:-$path}"
}

check_as_user() {
  local path="$1" expected="$2" jar="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -b "$jar" "$BASE$path")"
  report "$code" "$expected" "$path (signed in)"
}

post() {
  local path="$1" body="$2" expected="$3" label="$4" jar="${5:-}"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    ${jar:+-c "$jar"} -X POST -H 'content-type: application/json' \
    -d "$body" "$BASE$path")"
  report "$code" "$expected" "$label"
}

post_as_user() {
  local path="$1" body="$2" expected="$3" label="$4" jar="$5"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -b "$jar" \
    -X POST -H 'content-type: application/json' -d "$body" "$BASE$path")"
  report "$code" "$expected" "$label"
}

report() {
  local code="$1" expected="$2" label="$3"
  if [ "$code" = "$expected" ]; then
    printf '  ok    %-34s %s\n' "$label" "$code"
  else
    printf '  FAIL  %-34s got=%s want=%s\n' "$label" "$code" "$expected"
    failed=1
  fi
}

echo "smoke: AUTH_MODE=trusted-network"
start_app trusted-network
# A fresh install has no setup marker, so the dashboard redirects to the wizard.
check /              307
check /setup         200
check /api/missions  200
check /login         200
stop_app

# The bootstrap sequence, which is circular if any link breaks: the wizard sets
# the first password, and reaching the wizard is what needs one.
echo "smoke: AUTH_MODE=password"
start_app password
JAR="$(mktemp)"

check /setup         200 "/setup (unconfigured)"
check /api/setup     200 "/api/setup (unconfigured)"
check /api/missions  401 "/api/missions (anonymous)"

# Setting the password is what closes the wizard to anonymous callers, so it
# must hand back a session — otherwise the very next step, and Finish, are 401
# and the operator is locked out of the flow they are standing in.
post /api/setup "{\"step\":\"password\",\"password\":\"$TEST_PASSWORD\"}" \
  200 "set the first password" "$JAR"

post_as_user /api/setup "{\"step\":\"finish\"}" 200 "finish setup with that session" "$JAR"
post /api/setup "{\"step\":\"finish\"}" 401 "finish setup anonymously"

check /setup         307 "/setup (configured, anonymous)"
check /api/setup     401 "/api/setup (configured, anonymous)"

post /api/login "{\"password\":\"wrong-$TEST_PASSWORD\"}" 401 "login with a wrong password"
post /api/login "{\"password\":\"$TEST_PASSWORD\"}" 200 "login" "$JAR"

check_as_user /setup        200 "$JAR"
check_as_user /api/missions 200 "$JAR"

rm -f "$JAR"
stop_app

[ "$failed" -eq 0 ] && echo "smoke: app boots and serves" || echo "smoke: FAILED"
exit "$failed"
