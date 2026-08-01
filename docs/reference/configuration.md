# Configuration reference

Every value resolves in this order: **environment variable → `settings` table → default**. Environment wins
so a deployment can pin something the UI cannot silently change. A blank value is treated as unset.

`.env.example` is the canonical annotated copy — this page is the lookup table.

## Required

| Key         | Values                                                       | Notes                     |
| ----------- | ------------------------------------------------------------ | ------------------------- |
| `AUTH_MODE` | `cloudflare-access` (default), `password`, `trusted-network` | Selects the auth adapter. |

Each mode then requires its own keys:

| Mode                | Also required                                                         |
| ------------------- | --------------------------------------------------------------------- |
| `cloudflare-access` | `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`                              |
| `password`          | `SESSION_SECRET` (≥32 chars). The password itself is set in `/setup`. |
| `trusted-network`   | Nothing — but a non-loopback `HOST` also needs `ALLOW_INSECURE=1`.    |

An Anthropic credential is required for anything to run. Preferred is `CLAUDE_CODE_OAUTH_TOKEN` from
`claude setup-token`, which uses your Claude subscription rather than per-token API billing.

## Authentication

| Key                     | Default | Notes                                                                                                                                           |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_ACCESS_TEAM_DOMAIN` | —       | `<team>.cloudflareaccess.com`. Zero Trust → Settings → Custom Pages.                                                                            |
| `CF_ACCESS_AUD`         | —       | Application Audience tag. Zero Trust → Access → Applications. Verified on every request; without it any app in the same team would be accepted. |
| `SESSION_SECRET`        | —       | Signs the session cookie. `openssl rand -hex 32`. Cannot come from `/setup`: middleware runs before the database is reachable.                  |

## Network

| Key              | Default     | Notes                                                                                                                                       |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`           | `127.0.0.1` | Keep on loopback and let a proxy or tunnel reach it.                                                                                        |
| `PORT`           | `3000`      | 1–65535.                                                                                                                                    |
| `ALLOW_INSECURE` | unset       | Only `1` counts. Acknowledges a deliberately exposed unauthenticated instance; boot fails without it when `trusted-network` binds publicly. |

## Storage

| Key              | Default           | Notes                                                                                                           |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`       | `~/.claudevps`    | Holds `data.db`, created `chmod 600`.                                                                           |
| `WORKSPACE_ROOT` | `<DATA_DIR>/work` | Bare clones and per-mission worktrees. Grows with concurrent missions; point at a larger disk if repos are big. |

## Optional integrations

Absent credentials hide the feature rather than breaking it.

| Key                                      | Enables                            | Notes                                                           |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                      | The agent loop                     | Alternative to `claude setup-token`.                            |
| `GITHUB_TOKEN`                           | Issues panel, agent pushes and PRs | Fine-grained PAT: Contents, Issues, Pull requests (read/write). |
| `ASANA_TOKEN`                            | Tasks panel                        | Personal access token.                                          |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`  | Web push                           | Both required. `npx web-push generate-vapid-keys`.              |
| `VAPID_SUBJECT`                          | Web push                           | Contact address for push services.                              |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram alerts                    | Both required — a token with no chat id has nowhere to deliver. |

### The GitHub token reaches the agent

Agents are given `GITHUB_TOKEN` in their own environment, so `git` and `gh` can authenticate and a mission can
open its own pull request. An agent has a shell, so **anything it runs can read that token** — scope the PAT
to the repositories you are willing to have an agent write to. The reasoning, and the option that was rejected,
are in [ADR 0008](../adr/0008-agent-holds-the-git-token.md).

Without it, the issues panel is hidden and missions still run — they just cannot reach GitHub, and their work
stays on the server until you push it from the console.

## Settings-table only

Set from `/setup` or `/settings`; no environment equivalent.

| Key                               | Default           | Notes                                                                 |
| --------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `setup_complete`                  | unset             | Until set, every route redirects to `/setup`.                         |
| `password_hash`                   | —                 | scrypt, `scrypt:<salt>:<key>`.                                        |
| `default_base_branch`             | repo default      | Base for new mission branches.                                        |
| `max_concurrent_missions`         | —                 | Caps simultaneous agent sessions. The practical limit on a small VPS. |
| `sync_interval_seconds`           | —                 | How often issue and task caches refresh.                              |
| `git_user_name`, `git_user_email` | host `git config` | Identity for agent commits.                                           |
