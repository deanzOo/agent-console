# 1. Stream the transcript with SSE rather than WebSockets

- Status: accepted
- Date: 2026-07-30

## Context and problem statement

The browser needs the agent's transcript as it is produced, and the operator needs to send back answers to
approval prompts. A phone will sleep, lose signal, and reconnect mid-mission without losing transcript.

Next.js route handlers cannot host a WebSocket without replacing the Next server with a custom one.

## Considered options

- Server-sent events for output, plain POST for input
- WebSockets via a custom server
- Polling

## Decision

Server-sent events, with a `?since=<seq>` cursor; answers go back as ordinary POSTs.

## Consequences

Good:

- An SSE response is a `ReadableStream` from a normal route handler. No custom server, no `ws` dependency,
  no second listener to keep alive under systemd.
- Reconnection is built into `EventSource`, and because every event is persisted with a monotonic sequence,
  a reconnect replays exactly the gap. Durability comes from the `(mission_id, seq)` primary key, not from
  anything held in memory.
- The traffic is genuinely one-directional. A duplex channel would have been carrying nothing in one lane.

Bad:

- No client→server channel on the same connection, so anything interactive is a separate request. Fine for
  one-shot answers; it would be wrong for something like live typing indicators.
- HTTP/1.1 caps parallel connections per origin at six. Watching many missions at once in one tab would hit
  that. HTTP/2 (which the Cloudflare path gives us) multiplexes and removes it.

If bidirectional traffic ever becomes real, this is reversible: move to a custom server and swap the
transport. The persistence and cursor model stay as they are.
