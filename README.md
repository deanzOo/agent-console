# Agent Console

Run Claude Code agents on your own server and drive them from your phone.

Agents work in the background on their own git worktrees. When one needs your approval or has a question, it
tells you — and you answer with a tap, from wherever you are.

- **See what's running.** Every agent session, live, with a transcript written to be read on a phone — edits
  as coloured diffs, everything that is not the conversation folded into a chip beside it.
- **Answer without a terminal.** Tool approvals become buttons, not ANSI text. Say yes once for a tool and it
  stops asking for the rest of the mission.
- **Talk back mid-mission.** Reply to a working agent, or change how much it may do without asking.
- **Know when you're the blocker.** Web push or Telegram the moment an agent starts waiting.
- **Start work from anywhere.** A GitHub issue, an Asana task, or a sentence you type.
- **Ship it from your phone.** A finished mission's branch can be pushed and its pull request opened from the
  console — no session required, so it works long after the agent is gone.
- **Survives its own restart.** Deploying the console cannot kill a mission; the session host resumes what was
  running, or says why it did not.

Self-hosted, single binary-ish (one Node process + SQLite), and everything about your accounts lives in
config — clone it, add your own credentials, go.

## Quickstart

Needs Node 22+, git, and a Claude credential — run `claude setup-token` to use your subscription (no API
key required). A GitHub token is optional, and is what lets agents push branches and open pull requests.

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

The core loop works and has been used in earnest: start a mission, watch it, answer what it asks, and let it
open the pull request. GitHub issues, Asana tasks, notifications, and session recovery are wired.

Treat it as early software you own. It is a single process holding live agent sessions, and it is not a
sandbox — an agent with bash can do whatever the user running it can.

## License

MIT
