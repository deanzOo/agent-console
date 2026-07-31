#!/usr/bin/env bash
# Starts the session host, then the console, in one container.
#
# Order is load-bearing rather than incidental: agentd opens the database first
# and runs the migrations, so the two processes never race to create the schema.
# If either exits, so does the container — a console with no session host, or a
# session host with no console, is not a working deployment.
set -uo pipefail

AGENTD_PORT="${AGENTD_PORT:-3100}"
READY_TIMEOUT_SECONDS="${AGENTD_READY_TIMEOUT:-30}"

node apps/agentd/dist/server.mjs &
AGENTD_PID=$!

shutdown() {
  kill "$AGENTD_PID" "${WEB_PID:-}" 2>/dev/null
}
trap shutdown EXIT INT TERM

ready=0
for _ in $(seq 1 "$READY_TIMEOUT_SECONDS"); do
  if node -e "fetch('http://127.0.0.1:${AGENTD_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$AGENTD_PID" 2>/dev/null; then
    echo "entrypoint: agentd exited during startup" >&2
    exit 1
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "entrypoint: agentd did not become ready within ${READY_TIMEOUT_SECONDS}s" >&2
  exit 1
fi

npm start &
WEB_PID=$!

# Exit with whichever process died first, so the supervisor restarts the pair.
wait -n "$AGENTD_PID" "$WEB_PID"
exit $?
