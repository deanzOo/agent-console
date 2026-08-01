# 2. The backend is an MCP client, with no model in the dashboard path

- Status: accepted for agents; the dashboard's own reads are superseded by
  [ADR-0007](0007-plain-rest-for-issue-and-task-sync.md)
- Date: 2026-07-30

## Context and problem statement

The dashboard lists GitHub issues and Asana tasks. Agents also need to act on those services. Both need
credentials and both need a way to talk to each service.

## Considered options

- The backend speaks MCP directly (stdio child process per server)
- A dedicated always-on Claude session fetches lists and returns JSON
- Per-service REST clients written by hand

## Decision

The backend runs the same MCP servers the agents use, as long-lived stdio children, and calls their tools
directly. Results are cached in SQLite; the UI reads only the cache.

## Consequences

Good:

- One place to configure a service. The MCP config that lets an agent file an issue is the config that
  populates the issues panel.
- Adding a service is adding an MCP server, not writing and maintaining another REST client.
- No tokens spent and nothing to hallucinate. A count on a dashboard is a count.
- Reading from the cache means the panel renders instantly and survives an MCP server being down.

Bad:

- Child processes to supervise: spawn lazily, restart with backoff, and surface a dead server in the UI
  rather than showing a silently stale list.
- MCP tool schemas are looser than a typed SDK. Responses are parsed with zod at the boundary.
- A cache means staleness. Mitigated with a background refresh and an explicit refresh action.

Rejected: routing dashboard reads through a Claude session. It costs tokens on every refresh, takes seconds
instead of milliseconds, and can misreport a list — none of which is acceptable for a screen whose job is to
tell you the truth at a glance.
