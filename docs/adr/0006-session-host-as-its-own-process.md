# 6. The session host is its own process

Date: 2026-07-31

## Status

Accepted

## Context

Agent sessions are live `query()` generators and unresolved permission promises. They cannot be serialised,
so they live in process memory — which is why the app has always run as a single long-lived process.

The consequence was easy to miss until missions actually ran: **any deploy kills every mission in flight.**
Changing a button colour restarts the process and drops an agent that has been working for twenty minutes.
The UI is the part that changes daily; the sessions are the part that must not be interrupted. Holding both
in one process means the most volatile code decides the fate of the least interruptible.

Nothing about caching, build tooling or deployment tricks addresses this. The state is in memory, and the
process either survives or it does not.

## Decision

Extract `apps/agentd`: a small `node:http` server that owns the session registry, the live generators, the
parked permission promises and the SSE fan-out. `apps/web` keeps the UI, the routes and the auth boundary,
and reaches `agentd` over loopback.

- **Transport is HTTP + SSE**, not a Unix socket. It is the vocabulary the route handlers already speak, and
  the transcript stream proxies unchanged. A socket is marginally tighter and buys little once `agentd` binds
  loopback only.
- **`agentd` binds `127.0.0.1` and has no authentication.** Authentication stays entirely in `web`; two auth
  boundaries would be two things to get right. Exposing `agentd` would hand out an unauthenticated agent
  runner, which is why the bind address is not configurable.
- **Both processes open the same SQLite database.** WAL makes concurrent readers safe, and the container
  starts `agentd` first so migrations run once, in a defined order.
- **An unreachable `agentd` is reported as unreachable, never as failure.** The mission is still alive in a
  process that is merely restarting; showing `failed` would teach the operator to distrust the status.
  `web` replays the transcript from the database and emits `agentd.unreachable`.

## Consequences

Deploying the UI no longer touches running missions — the reason for the change.

The cost is a second process to supervise. Both ship in one image and are started together, so a peer still
gets one container and one `.env`; that property was the thing most at risk and is deliberately preserved.

`web` must hold **no** session state. If a route handler starts caching anything about a live mission, the
original problem returns quietly and the split will appear to have worked while no longer working.

The acceptance test is specific, and belongs in every future change to this boundary: start a mission, let it
park on an approval, redeploy `web` while it is parked, then answer. The agent must continue.
