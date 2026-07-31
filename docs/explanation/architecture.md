# Architecture

## The shape of it

```text
phone ──https──> reverse proxy / Cloudflare edge (authenticates)
                     │
                     ▼
          apps/web — next start          the console. Redeployable at will
          ├── app/                       pages and route handlers (thin)
          ├── middleware.ts              the auth boundary. Lives only here
          └── lib/agentd.ts              speaks to the session host over loopback
                     │
                     │ http + SSE, 127.0.0.1 only
                     ▼
          apps/agentd                    the session host. Restarting it kills missions
          ├── Map<missionId, session>    live runs and parked permission promises
          └── SSE fan-out                replay from SQLite, then tail
                     │
          packages/core                  shared by both; imports no framework
          ├── auth/  mcp/  repos.ts      adapters, MCP clients, worktree lifecycle
          └── SQLite                     missions, transcript, settings
                     │
                     ├── agent session → cwd = $WORKSPACE_ROOT/wt/<missionId>/
                     └── git worktrees ← $WORKSPACE_ROOT/repos/<repo>.git (bare)
```

**Why two processes.** Sessions live in memory, so whichever process holds them cannot be restarted without
killing every mission in flight. Keeping them in the web app meant a CSS change dropped a running agent.
`agentd` is the part that must stay up; `web` is the part that changes daily. Splitting them is what makes
the second deployable without consequence.

`agentd` binds loopback and has no authentication of its own — authentication lives in `web`, and exposing
`agentd` to a network would hand out an unauthenticated agent runner.

## The core loop

A **mission** is one Claude Code agent session with a job. Creating one clones the repo (bare, once), adds a
worktree for this mission alone, and starts an Agent SDK session with that worktree as its working directory.

The session runs as an async generator. Every message it emits is appended to the `events` table with a
monotonic sequence number, then fanned out to any connected browser. Nothing is held only in memory, so the
transcript survives a reload, a phone sleeping, or the process restarting.

When the agent wants to use a tool that needs permission, the SDK calls `canUseTool`. That handler writes a
row to `pending_prompts`, flips the mission to `awaiting_input`, fires notifications, and **returns a promise
it does not resolve**. The agent is now genuinely blocked, and the UI has a structured description of what it
is blocked on — a tool name and its arguments, not a line of terminal output to pattern-match. Answering
resolves the promise and the agent continues.

That parked promise is the whole product. Everything else is plumbing around it.

## Why these choices

**One process.** Sessions are live generators and unresolved promises; they cannot be serialised into a
shared store or handed between workers. So the app is deliberately one long-lived process. This caps how many
missions run at once, which on a small VPS is a feature — the limit is CPU, not architecture.

**SSE, not WebSockets.** The transcript flows one way. Answers are one-shot POSTs. Server-sent events are a
plain HTTP response, need no custom server alongside Next, and reconnect on their own. The client passes the
last sequence number it saw, so a reconnect replays the gap from SQLite rather than losing it. See
[ADR 0001](../adr/0001-sse-over-websockets.md).

**SQLite.** Single process, single writer, data measured in megabytes. A separate database server would be
one more thing to install, back up, and explain to someone deploying this on their own box. WAL mode keeps
transcript readers from blocking the agent loop's writes.

**The backend is an MCP client.** Dashboard lists come from calling MCP servers directly over stdio — no
model in the loop. Asking a Claude session to fetch your issue list would cost tokens on every refresh and
could hallucinate a count. Agents use the same MCP configuration, so there is one place to configure a
service. See [ADR 0002](../adr/0002-backend-as-mcp-client.md).

**A worktree per mission.** Two agents on the same repository must not share a checkout — the first
`git checkout` would yank the ground out from under the second. Bare clone plus one worktree per mission
gives each agent an isolated tree and its own branch, at the cost of a directory. See
[ADR 0003](../adr/0003-worktree-per-mission.md).

**Auth is an adapter.** The deployment is someone else's, and not everyone has a Cloudflare account. One
`getUser` interface, three implementations, chosen by `AUTH_MODE`. See
[ADR 0004](../adr/0004-pluggable-auth.md).

## Trust boundaries

The agent runs real commands in a real checkout with real credentials. Containment comes from three places:

1. **Worktree isolation** — a mission's working directory is its own; it cannot disturb another mission's.
2. **The permission gate** — anything not in `allowedTools` stops at `canUseTool` and waits for a human.
3. **The network** — authentication happens before the app, and the app verifies it again itself.

What is deliberately _not_ claimed: this is not a sandbox. An agent with bash can do anything the service
user can. Run it as a dedicated unprivileged user, and give its tokens the narrowest scope that works.
