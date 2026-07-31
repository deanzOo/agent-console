#!/usr/bin/env bash
# Deploy a ref to a server over ssh, then prove it is actually serving.
#
#   scripts/deploy.sh [ref]        # defaults to main
#
# Nothing about any particular deployment lives here. The host, the path and the
# public URL come from .deploy.env, which is gitignored — so this script ships to
# everyone and points at nobody.
#
# It is deliberately not a GitHub workflow. A public repository plus a
# self-hosted runner means a fork's pull request can run code on the server, and
# a hostname in a workflow file is exactly the deployment-specific literal that
# scripts/check-no-hardcoded-config.sh rejects.
set -uo pipefail

cd "$(dirname "$0")/.."

CONFIG=".deploy.env"
REF="${1:-main}"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

fail() { printf '%s%s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }
step() { printf '%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }

if [ ! -f "$CONFIG" ]; then
  cat >&2 <<EOF
${RED}No $CONFIG.${RESET}

Create it with your own values — it is gitignored and never leaves your machine:

  DEPLOY_HOST=my-server          # an ssh host or user@host
  DEPLOY_PATH=/opt/agent-console # where the repo is checked out there
  DEPLOY_URL=https://console.example.com   # optional, verified after deploy
EOF
  exit 1
fi

# shellcheck disable=SC1090
. "./$CONFIG"

: "${DEPLOY_HOST:?DEPLOY_HOST is not set in $CONFIG}"
: "${DEPLOY_PATH:?DEPLOY_PATH is not set in $CONFIG}"

step "Deploying $REF to $DEPLOY_HOST:$DEPLOY_PATH"

# Fetch and reset rather than pull: the server's checkout is a deployment
# artefact, not a working copy, and a merge conflict there is a stuck deploy.
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && git fetch --quiet origin && git reset --hard 'origin/$REF' --quiet && git log --oneline -1" \
  || fail "Could not update the checkout on $DEPLOY_HOST"

step "Building"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose build" > /tmp/deploy-build.log 2>&1 \
  || { tail -20 /tmp/deploy-build.log >&2; fail "Build failed on $DEPLOY_HOST"; }

step "Restarting"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose up -d" \
  || fail "Could not start the container"

# Healthy is the container's own answer, and it is the first thing that catches
# a container which starts and then cannot serve.
step "Waiting for healthy"
healthy=0
for _ in $(seq 1 60); do
  status="$(ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose ps --format '{{.Status}}'" 2>/dev/null)"
  case "$status" in
    *healthy*) healthy=1; break ;;
    *Exited*|*Restarting*) fail "Container is $status" ;;
  esac
  sleep 2
done
[ "$healthy" -eq 1 ] || fail "Container never became healthy"

# The session host has no route through the proxy, so it is asked from inside.
step "Checking the session host"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && docker compose exec -T agent-console node -e \"fetch('http://127.0.0.1:'+(process.env.AGENTD_PORT||3100)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\"" \
  || fail "agentd is not answering on loopback"

if [ -n "${DEPLOY_URL:-}" ]; then
  # A container reporting healthy while the site 500s has happened here, so the
  # deploy is not finished until the public URL answers.
  step "Checking $DEPLOY_URL"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$DEPLOY_URL/login")"
  [ "$code" = "200" ] || fail "$DEPLOY_URL/login returned $code, expected 200"
  printf '%s  /login %s%s\n' "$GREEN" "$code" "$RESET"
fi

printf '%s%sDeployed %s.%s\n' "$BOLD" "$GREEN" "$REF" "$RESET"
