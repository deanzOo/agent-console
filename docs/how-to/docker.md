# Run it with Docker

## Why the CLI lives in the image

The Agent SDK does not connect to a Claude service — it **spawns the `claude` CLI as a child process** and
talks to it over stdio. There is nothing on your host for a container to reach over the network, so the CLI
is installed inside the image. `host.docker.internal` and friends are not part of this picture.

The upside: the agent's blast radius stops at the container instead of your whole host, which is the biggest
gap in the systemd deployment.

## Credentials

**Use your Claude subscription — no API key needed.** On any machine where you are already logged in:

```bash
claude setup-token
```

That prints a long-lived token. Put it in `.env`:

```bash
CLAUDE_CODE_OAUTH_TOKEN=<the token>
```

The SDK passes it to the CLI it spawns, so the container authenticates as you without a credential file and
without per-token API billing.

Two alternatives, in descending order of convenience:

- **`ANTHROPIC_API_KEY`** — billed per token. Works identically; use it if you would rather not tie the
  server to your personal login.
- **Mounting a host login** — uncomment the `~/.claude` bind mount in `docker-compose.yml`. Only worth it if
  you already have a logged-in CLI on the host and do not want to mint a token. Note macOS keeps that
  credential in the Keychain rather than on disk, so the mount carries nothing there.

> The token is a credential for your account. It lives in `.env` (`chmod 600`) and in the container's
> environment — treat the host as you would any machine holding your login.

## Start it

```bash
cp .env.example .env    # set AUTH_MODE and its keys
docker compose up -d --build
docker compose logs -f
```

The port binds to `127.0.0.1:3000`, so nothing is exposed until you put cloudflared or a reverse proxy in
front — see [deploy.md](deploy.md), which applies unchanged from step 4 onward.

If something already holds 3000 on the host, set `HOST_PORT` in `.env` and point your proxy at that
instead. The container always listens on 3000 internally.

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
- `better-sqlite3` compiles from source on this base image, so the build stage installs python3/make/g++.
  They are discarded with that stage — the runtime image has no compiler. Expect the first build to take a
  few minutes; later ones hit the layer cache.
- The container runs as uid 10001, never root.
