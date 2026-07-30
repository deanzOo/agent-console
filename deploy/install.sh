#!/usr/bin/env bash
# Idempotent installer for a systemd deployment. Safe to re-run: it upgrades in
# place rather than starting over.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
SERVICE_NAME="${SERVICE_NAME:-agent-console}"
UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

die() { echo "error: $*" >&2; exit 1; }

command -v node >/dev/null || die "node is not installed (needs 22+)"
command -v git  >/dev/null || die "git is not installed"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || die "node 22+ required, found $(node -v)"

[ -f "$APP_DIR/.env" ] || die "no .env in $APP_DIR — copy .env.example and fill it in first"

if ! grep -qE '^(CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY)=.+' "$APP_DIR/.env"; then
  # A logged-in CLI on this host is a valid third path, so only warn there.
  if command -v claude >/dev/null; then
    echo "note: no credential in .env — relying on the logged-in claude CLI" >&2
  else
    die "no Anthropic credential. Run 'claude setup-token' and put the result in CLAUDE_CODE_OAUTH_TOKEN, or set ANTHROPIC_API_KEY in .env"
  fi
fi

echo "==> Installing dependencies"
(cd "$APP_DIR" && npm ci --omit=dev --ignore-scripts=false >/dev/null)

echo "==> Building"
(cd "$APP_DIR" && npm run build >/dev/null)

echo "==> Writing $UNIT"
sudo tee "$UNIT" >/dev/null <<UNIT_EOF
[Unit]
Description=Agent Console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=$(command -v npm) start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT_EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME" >/dev/null
sudo systemctl restart "$SERVICE_NAME"

echo
echo "Installed. Next:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  Put a tunnel or reverse proxy in front, then open /setup."
