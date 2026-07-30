import type { StoredEvent } from "./missions";

export function parseSince(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// JSON.stringify keeps the payload on a single line, which matters: a raw
// newline inside `data:` would split the frame.
export function formatSseEvent(event: StoredEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
