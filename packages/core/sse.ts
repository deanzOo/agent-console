import type { StoredEvent } from "./missions";

/** Written on an idle stream so a proxy does not close it as dead. */
export const HEARTBEAT_MS = 25_000;

export const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export function parseSince(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// CR and LF both end a line in the SSE grammar, so either one inside a field
// value ends the field early and the rest is read as a new one. The event type
// reaches here as `agent.${message.type}` — a string from the Agent SDK, which
// is a trust boundary however tame its values look today.
const SSE_LINE_TERMINATORS = /[\r\n]+/g;

// JSON.stringify keeps the payload on a single line, which matters for the same
// reason: a raw newline inside `data:` would split the frame.
export function formatSseEvent(event: StoredEvent): string {
  const type = event.type.replace(SSE_LINE_TERMINATORS, " ");
  return `id: ${event.seq}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}
