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
  | {
      readonly kind: "edit";
      readonly path: string;
      readonly removed: string[];
      readonly added: string[];
    }
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
const EDIT_TOOLS = ["Edit", "MultiEdit", "Write", "NotebookEdit"];

function linesOf(value: unknown): string[] {
  const text = asString(value);
  // An empty string is no lines, not one blank one — otherwise every insertion
  // reports a removal it did not make.
  return text === "" ? [] : text.split("\n");
}

// An Edit replaces one string with another, so the change is already stated:
// the old lines go, the new lines arrive. No diff algorithm needed, and the
// counts are exact rather than approximated.
function readEdit(name: string, input: unknown): TranscriptEntry | undefined {
  const fields = asRecord(input);
  const path = asString(fields.file_path) || asString(fields.path) || name;

  const edits = Array.isArray(fields.edits) ? fields.edits.map(asRecord) : undefined;
  if (edits) {
    return {
      kind: "edit",
      path,
      removed: edits.flatMap((edit) => linesOf(edit.old_string)),
      added: edits.flatMap((edit) => linesOf(edit.new_string)),
    };
  }

  if ("old_string" in fields || "new_string" in fields) {
    return {
      kind: "edit",
      path,
      removed: linesOf(fields.old_string),
      added: linesOf(fields.new_string),
    };
  }

  // Write replaces the file, so everything in it is an addition.
  const content = fields.content ?? fields.new_source;
  if (content !== undefined) {
    return { kind: "edit", path, removed: [], added: linesOf(content) };
  }

  return undefined;
}

function fromAssistant(payload: Record<string, unknown>): TranscriptEntry {
  if (asString(payload.thinking) !== "") return { kind: "hidden" };

  for (const block of contentBlocks(payload)) {
    if (block.type === "text" && asString(block.text) !== "") {
      return { kind: "said", who: "agent", text: asString(block.text) };
    }
    if (block.type === "tool_use") {
      const name = asString(block.name) || "a tool";
      if (EDIT_TOOLS.includes(name)) {
        const edit = readEdit(name, block.input);
        if (edit) return edit;
      }
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

export interface Aside {
  readonly label: string;
  readonly items: TranscriptItem[];
}

export interface TranscriptRow {
  readonly item: TranscriptItem;
  /** Hidden runs that happened around this entry, shown beside it. */
  readonly aside: Aside[];
}

/**
 * Turns a stream of events into rows of things the agent actually did, with
 * everything else tucked alongside.
 *
 * Hidden events used to get a line each. One real mission produced 164
 * `agent.system` events, so even as one-line placeholders that was 164 rows to
 * scroll past. They now hang off the entry they followed, folded by type and
 * counted, so the column reads as a conversation and nothing is lost.
 */
export function groupTranscript(items: readonly TranscriptItem[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let pending: Aside[] = [];

  const fold = (item: TranscriptItem) => {
    const last = pending.at(-1);
    // Only a run of the same type folds: "agent.system (3)" says something,
    // "hidden (3)" of three different kinds says nothing.
    if (last && last.label === item.type) last.items.push(item);
    else pending.push({ label: item.type, items: [item] });
  };

  for (const item of items) {
    if (item.entry.kind === "hidden") {
      fold(item);
      continue;
    }

    const previous = rows.at(-1);
    // Anything before the first visible entry hangs off that entry instead,
    // rather than opening the transcript with a row of noise.
    if (previous) previous.aside.push(...pending);
    rows.push({ item, aside: previous ? [] : pending });
    pending = [];
  }

  // Whatever trailed the last entry belongs to it.
  const last = rows.at(-1);
  if (last) last.aside.push(...pending);

  return rows;
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
