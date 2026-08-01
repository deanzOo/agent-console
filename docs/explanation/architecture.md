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
          apps/agentd                    the session host. Survives its own restart
          ├── Map<missionId, session>    live runs and parked permission promises
          ├── recovery on boot           resumes what was live, or says why it did not
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

**Restarting `agentd` no longer ends a mission.** The Agent SDK's session id is stored as the mission runs, so
on boot the host resumes anything the database still calls live. It gives up deliberately in four cases — no
session id, a working tree that is gone, too many attempts already, too many waiting at once — and records
which one, because a mission that stops needs to say why. The attempt count comes from the transcript rather
than a column: if resuming is what kills the process, a counter that resets on restart would not survive the
case it exists for.

## The core loop

A **mission** is one Claude Code agent session with a job. Creating one clones the repo (bare, once), adds a
worktree for this mission alone, and starts an Agent SDK session with that worktree as its working directory.

The session runs as an async generator. Every message it emits is appended to the `events` table with a
monotonic sequence number, then fanned out to any connected browser. Nothing is held only in memory, so the
transcript survives a reload, a phone sleeping, or the process restarting.

When the agent wants to use a tool that needs permission, a **`PreToolUse` hook** writes a row to
`pending_prompts`, flips the mission to `awaiting_input`, fires notifications, and **returns a promise it does
not resolve**. The agent is now genuinely blocked, and the UI has a structured description of what it is
blocked on — a tool name and its arguments, not a line of terminal output to pattern-match. Answering resolves
the promise and the agent continues.

It is a hook rather than `canUseTool` for a reason worth knowing: **`canUseTool` is not consulted for every
call.** The CLI decides first, and a tool it is willing to run on its own never reaches the callback. The hook
is asked about all of them. That also means the hook, not the CLI, is what a permission mode means here —
setting a mode the hook ignores changes nothing, which is exactly how "auto edits" came to ask about
everything anyway. `packages/core/agents/policy.ts` holds that decision: reads never ask, edits ask unless the
mode says otherwise, and Bash asks in every mode.

That parked promise is the whole product. Everything else is plumbing around it.

## Why these choices

**One process per concern, and neither of them clustered.** Sessions are live generators and unresolved
promises; they cannot be serialised into a shared store or handed between workers. `agentd` is therefore a
single long-lived process, and anything assuming it can be scaled horizontally is a bug. This caps how many
missions run at once, which on a small VPS is a feature — the limit is CPU, not architecture.

**SSE, not WebSockets.** The transcript flows one way. Answers are one-shot POSTs. Server-sent events are a
plain HTTP response, need no custom server alongside Next, and reconnect on their own. The client passes the
last sequence number it saw, so a reconnect replays the gap from SQLite rather than losing it. See
[ADR 0001](../adr/0001-sse-over-websockets.md).

**SQLite.** Single process, single writer, data measured in megabytes. A separate database server would be
one more thing to install, back up, and explain to someone deploying this on their own box. WAL mode keeps
transcript readers from blocking the agent loop's writes.

**No model in the dashboard path.** Lists come from the services directly — asking a Claude session to fetch
your issue list would cost tokens on every refresh and could hallucinate a count. Agents still get MCP
servers; the dashboard's own reads go over plain REST, because the Asana endpoint the MCP server calls is
premium-only and answered "search is only available to premium users" as an empty result that looked like
success. See [ADR 0002](../adr/0002-backend-as-mcp-client.md) and
[ADR 0007](../adr/0007-plain-rest-for-issue-and-task-sync.md).

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
2. **The permission gate** — every tool call passes the `PreToolUse` hook, which asks unless the mission's
   own policy already says yes.
3. **The network** — authentication happens before the app, and the app verifies it again itself.

What is deliberately _not_ claimed: this is not a sandbox. An agent with bash can do anything the service
user can. Run it as a dedicated unprivileged user, and give its tokens the narrowest scope that works.

That last point is not theoretical. Agents are handed the GitHub token in their environment so `git` and `gh`
can authenticate, which is what lets a mission open its own pull request — and it means anything an agent runs
can read that token. Scope the PAT to the repositories you are willing to have an agent write to. See
[ADR 0008](../adr/0008-agent-holds-the-git-token.md).
