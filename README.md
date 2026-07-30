# Agent Console

Run Claude Code agents on your own server and drive them from your phone.

Agents work in the background on their own git worktrees. When one needs your approval or has a question, it
tells you — and you answer with a tap, from wherever you are.

- **See what's running.** Every agent session, live, with its transcript.
- **Answer without a terminal.** Tool approvals and questions become buttons, not ANSI text.
- **Know when you're the blocker.** Web push or Telegram the moment an agent starts waiting.
- **Start work from anywhere.** A GitHub issue, an Asana task, or a sentence you type.

Self-hosted, single binary-ish (one Node process + SQLite), and everything about your accounts lives in
config — clone it, add your own credentials, go.

## Quickstart

Needs Node 22+, git, and an Anthropic credential (`claude setup-token`, or an API key).

```bash
git clone <your-fork> agent-console && cd agent-console
cp .env.example .env      # then fill in AUTH_MODE and its keys
npm ci
npm run build
npm start
```

Open the app and complete `/setup` — it walks through credentials and validates each one before moving on.

For a real deployment (systemd, Cloudflare Tunnel, Docker), see **[docs/how-to/deploy.md](docs/how-to/deploy.md)**.

## Documentation

Organised by what you're trying to do ([Diátaxis](https://diataxis.fr)):

|                                                |                                                           |
| ---------------------------------------------- | --------------------------------------------------------- |
| **[Tutorial](docs/tutorial/first-mission.md)** | Start here — from install to your first completed mission |
| **[How-to guides](docs/how-to/)**              | Deploy, upgrade, back up, troubleshoot                    |
| **[Reference](docs/reference/)**               | Every environment variable, setting, and API route        |
| **[Explanation](docs/explanation/)**           | Architecture, and why it is built this way                |
| **[Decisions](docs/adr/)**                     | ADRs — the reasoning behind each significant choice       |

Contributors: **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[CLAUDE.md](CLAUDE.md)** (the conventions this repo
enforces). Security policy: **[SECURITY.md](SECURITY.md)**.

## Status

The core loop works: start a mission, watch it, answer what it asks. GitHub issues, Asana tasks, and
notifications are wired. It has not yet been run in anger for long — treat it as early software you own.

## License

MIT
