# Run it with Docker

## Why the CLI lives in the image

The Agent SDK does not connect to a Claude service — it **spawns the `claude` CLI as a child process** and
talks to it over stdio. There is nothing on your host for a container to reach over the network, so the CLI
is installed inside the image. `host.docker.internal` and friends are not part of this picture.

The upside: the agent's blast radius stops at the container instead of your whole host, which is the biggest
gap in the systemd deployment.

## Credentials

Pick one.

**An API key** — simplest, and the only option that works the same on every platform. Put
`ANTHROPIC_API_KEY` in `.env`.

**A mounted login** — if you ran `claude setup-token` on the host, `docker-compose.yml` already bind-mounts
`~/.claude` into the container. Override the location with `CLAUDE_CONFIG_DIR` if yours differs.

> On macOS `claude setup-token` stores the credential in the Keychain, not in `~/.claude`, so the mount has
> nothing to carry. Use the API key there.

## Start it

```bash
cp .env.example .env    # set AUTH_MODE and its keys
docker compose up -d --build
docker compose logs -f
```

The port binds to `127.0.0.1:3000`, so nothing is exposed until you put cloudflared or a reverse proxy in
front — see [deploy.md](deploy.md), which applies unchanged from step 4 onward.

## What the volumes hold

| Volume      | Contents                                    | Losing it means                         |
| ----------- | ------------------------------------------- | --------------------------------------- |
| `data`      | `data.db` — missions, transcripts, settings | Every mission and all configuration     |
| `workspace` | Bare clones and per-mission worktrees       | Uncommitted agent work; clones re-fetch |

Back up `data`. `workspace` is reconstructible as long as agents push their branches.

## Giving agents push access

The container needs its own credentials to push:

- **HTTPS** — a `GITHUB_TOKEN` in `.env` is used for clone and fetch automatically.
- **SSH** — mount a deploy key read-only into `/home/agent/.ssh/` and configure git to use it. Keep the
  mount `:ro`, and use a key scoped to the repositories you want agents touching.

## Notes

- **One container.** Agent sessions live in process memory; a second replica would not see them. Do not scale
  this service.
- `better-sqlite3` resolves a prebuilt binary for `node:22-bookworm-slim`, so the image needs no compiler.
- The container runs as uid 10001, never root.
