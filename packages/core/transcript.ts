import type { StoredEvent } from "./missions";

/**
 * What a transcript event means, in this application's own words.
 *
 * The Agent SDK's message union is a wire format: token counts, cache
 * statistics, uuids and session ids around a small amount of content. Rendering
 * it directly is why the mission screen read as a wall of JSON. This is the one
 * place that knows the shape, so the UI can render meaning instead.
 */
export type TranscriptEntry =
  | { readonly kind: "said"; readonly who: "agent" | "operator"; readonly text: string }
  | { readonly kind: "thinking"; readonly text: string }
  | { readonly kind: "tool"; readonly name: string; readonly summary: string }
  | { readonly kind: "output"; readonly text: string; readonly failed: boolean }
  | { readonly kind: "status"; readonly text: string; readonly error?: string }
  | { readonly kind: "asked"; readonly name: string; readonly summary: string }
  | { readonly kind: "note"; readonly text: string }
  /** Nothing worth showing; the raw payload is still available on demand. */
  | { readonly kind: "hidden" };

export interface TranscriptItem {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly entry: TranscriptEntry;
  readonly raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function contentBlocks(payload: Record<string, unknown>): Record<string, unknown>[] {
  const message = asRecord(payload.message);
  const content = message.content;
  return Array.isArray(content) ? content.map(asRecord) : [];
}

// A command is what the operator is actually approving, so it leads. Everything
// else falls back to the description the agent gave, then to the tool's name.
function describeToolInput(name: string, input: unknown): string {
  const fields = asRecord(input);
  const command = asString(fields.command);
  if (command) return command;

  const filePath = asString(fields.file_path) || asString(fields.path);
  if (filePath) return filePath;

  const pattern = asString(fields.pattern);
  if (pattern) return pattern;

  const url = asString(fields.url);
  if (url) return url;

  const description = asString(fields.description);
  if (description) return description;

  return name;
}

function readToolResult(
  payload: Record<string, unknown>,
  block: Record<string, unknown>,
) {
  const result = asRecord(payload.tool_use_result);
  const stdout = asString(result.stdout);
  const stderr = asString(result.stderr);
  const failed = block.is_error === true || result.is_error === true;

  // stdout is the thing being read; stderr matters mostly when it failed.
  const body = [stdout, failed ? stderr : ""].filter((part) => part !== "").join("\n");
  if (body !== "") return { text: body, failed };

  const content = asString(block.content);
  if (content !== "") return { text: content, failed };

  return { text: "(no output)", failed };
}

// Reasoning is how it got there, not what it did. It stays reachable as raw,
// because when something goes wrong it is the first thing worth reading.
function fromAssistant(payload: Record<string, unknown>): TranscriptEntry {
  if (asString(payload.thinking) !== "") return { kind: "hidden" };

  for (const block of contentBlocks(payload)) {
    if (block.type === "text" && asString(block.text) !== "") {
      return { kind: "said", who: "agent", text: asString(block.text) };
    }
    if (block.type === "tool_use") {
      const name = asString(block.name) || "a tool";
      return { kind: "tool", name, summary: describeToolInput(name, block.input) };
    }
    if (block.type === "thinking") return { kind: "hidden" };
  }
  return { kind: "hidden" };
}

function fromUser(payload: Record<string, unknown>): TranscriptEntry {
  for (const block of contentBlocks(payload)) {
    if (block.type === "tool_result") {
      const { text, failed } = readToolResult(payload, block);
      return { kind: "output", text, failed };
    }
    if (block.type === "text" && asString(block.text) !== "") {
      return { kind: "said", who: "operator", text: asString(block.text) };
    }
  }
  return { kind: "hidden" };
}

// A mission flips between running and awaiting_input on every approval — in one
// real transcript that was seventy lines saying nothing. Only the end of a
// mission is worth a line, and an error always is.
const TERMINAL_STATUSES = ["done", "failed", "stopped"];

function fromStatus(payload: Record<string, unknown>): TranscriptEntry {
  const status = asString(payload.status).replace("_", " ");
  const error = asString(payload.error);

  if (error) return { kind: "status", text: status, error };
  if (!TERMINAL_STATUSES.includes(asString(payload.status))) return { kind: "hidden" };
  return { kind: "status", text: status };
}

export function summarise(event: StoredEvent): TranscriptEntry {
  const payload = asRecord(event.payload);

  switch (event.type) {
    case "agent.assistant":
      return fromAssistant(payload);
    case "agent.user":
      return fromUser(payload);
    case "mission.status":
      return fromStatus(payload);
    case "mission.said":
      return { kind: "said", who: "operator", text: asString(payload.text) };
    case "mission.mode":
      return { kind: "note", text: `mode changed to ${asString(payload.mode)}` };
    case "mission.created":
      return { kind: "said", who: "operator", text: asString(payload.prompt) };
    // The tool call it belongs to is already in the transcript, saying the same
    // thing, and the approval itself is pinned to the bottom of the screen
    // while it is open. A third copy is noise.
    case "mission.prompt":
      return { kind: "hidden" };
    case "agent.result": {
      const failed = payload.is_error === true;
      return { kind: "status", text: failed ? "failed" : "finished" };
    }
    // The init payload is a page of capability listing, and a rate-limit notice
    // is not part of the conversation. Both stay available as raw.
    case "agent.system":
    case "agent.rate_limit_event":
      return { kind: "hidden" };
    default:
      return { kind: "note", text: event.type };
  }
}

export function toTranscript(events: readonly StoredEvent[]): TranscriptItem[] {
  return events.map((event) => ({
    seq: event.seq,
    ts: event.ts,
    type: event.type,
    entry: summarise(event),
    raw: event.payload,
  }));
}
