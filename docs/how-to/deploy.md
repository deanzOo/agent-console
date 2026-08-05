# Deploy to a server

> Prefer [Docker](docker.md) if you can — it contains the agent, which can otherwise run any command the
> service user can. `deploy/install.sh` automates the steps below if you would rather use systemd.

## Prerequisites

- A Linux host with Node 22+ and git. 2 vCPU / 8 GB is comfortable for a handful of concurrent missions.
- An Anthropic credential. Run `claude setup-token` on any machine where you are logged in and put the
  result in `CLAUDE_CODE_OAUTH_TOKEN` — this uses your Claude subscription rather than API billing.
  `ANTHROPIC_API_KEY` works too, and a `claude` CLI already logged in on the host is a third option.
- A dedicated unprivileged user. The agent can run arbitrary commands as whoever owns the process — do not
  make that root, and do not make it your own account.

## 1. Install

```bash
sudo adduser --system --group --home /opt/agent-console agent-console
sudo -u agent-console git clone <your-fork> /opt/agent-console/app
cd /opt/agent-console/app
sudo -u agent-console npm ci
sudo -u agent-console npm run build
```

## 2. Configure

```bash
sudo -u agent-console cp .env.example .env
sudo -u agent-console chmod 600 .env
sudo -u agent-console "$EDITOR" .env
```

At minimum set `AUTH_MODE` and the keys it requires. See
[the configuration reference](../reference/configuration.md).

Keep `HOST=127.0.0.1`. Nothing should reach this port except your proxy or tunnel.

## 3. Run it as a service

Create `/etc/systemd/system/agent-console.service`:

```ini
[Unit]
Description=Agent Console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agent-console
WorkingDirectory=/opt/agent-console/app
EnvironmentFile=/opt/agent-console/app/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agent-console
sudo systemctl status agent-console
```

**Exactly one instance.** Agent sessions live in this process's memory; a second copy would not see them.
Do not add a process manager that forks workers.

## 4. Expose it

### Cloudflare Tunnel (matches the default `AUTH_MODE`)

```bash
cloudflared tunnel login
cloudflared tunnel create agent-console
cloudflared tunnel route dns agent-console console.example.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/<tunnel-id>.json
ingress:
  - hostname: console.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Then in Zero Trust → Access → Applications, add a self-hosted application for that hostname with a policy
allowing your email. Copy its **Application Audience (AUD) tag** into `CF_ACCESS_AUD`, and your team domain
into `CF_ACCESS_TEAM_DOMAIN`.

```bash
sudo cloudflared service install
```

No inbound ports are opened.

### Alternative: your own domain

Set `AUTH_MODE=password` and `SESSION_SECRET=$(openssl rand -hex 32)`, and put Caddy or nginx in front with
TLS, proxying to `127.0.0.1:3000`.

## 5. Finish setup

Open the hostname and complete `/setup`. Each credential is validated live, so a wrong token fails there
rather than halfway through your first mission.

## Where the image comes from

CI builds it and publishes it to `ghcr.io`, tagged with the commit. The server
pulls that tag; it never builds.

That is not tidiness. The server has two cores and runs agents: a container
build there means `npm ci` competing with them for memory, and on a box with no
swap the OOM killer takes the build — repeatedly, since buildx retries — until
the machine stops answering. That happened, and it is why this changed.

Anyone running this without a registry still can: `docker compose up --build`
builds locally, because the compose file declares both an image and a build
context. `AGENT_CONSOLE_IMAGE` is what a deployment sets to pull instead.

**One-time setup:** the package at `ghcr.io/<owner>/agent-console` is private
when first published. Make it public, or give the server a token that can read
packages, or the pull will fail with a message about authentication rather than
about the image.

## Upgrading

Pull, build, restart. **A redeploy no longer ends a mission**: the session host stores each session's id as it
runs and resumes anything the database still calls live when it comes back. A mission it will not resume is
stopped with the reason recorded in its transcript — no session to resume, a working tree that is gone, too
many attempts already, or too many waiting at once.

An approval that was open when the process went down is closed, and the agent asks again after resuming. Seeing
the same request twice beats losing the work behind it.

## Verify

- `systemctl status agent-console` is active, and stays active across `sudo reboot`.
- The hostname prompts for authentication before showing anything.
- `curl http://127.0.0.1:3000/` **from the host** returns 401, not a page — the app enforces auth itself, so
  a leaked hostname or a bypassed edge is not enough to get in.
