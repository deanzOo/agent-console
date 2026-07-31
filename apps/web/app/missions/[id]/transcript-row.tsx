"use client";

import { useState } from "react";
import type { TranscriptItem } from "@agent-console/core/transcript";

// Long tool output pushes everything else off a phone screen, so it is clipped
// until asked for. The number is lines, not characters: a wide line is one line.
const CLIPPED_LINES = 12;

function Body({ text, mono }: { text: string; mono?: boolean }) {
  const lines = text.split("\n");
  const long = lines.length > CLIPPED_LINES;
  const [open, setOpen] = useState(false);
  const shown = open || !long ? text : lines.slice(0, CLIPPED_LINES).join("\n");

  return (
    <>
      <pre
        className={`overflow-x-auto break-words whitespace-pre-wrap ${
          mono ? "font-mono text-xs" : "text-sm"
        }`}
      >
        {shown}
      </pre>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs text-neutral-500 underline"
        >
          {open ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </>
  );
}

export function TranscriptRow({ item }: { item: TranscriptItem }) {
  const [raw, setRaw] = useState(false);
  const { entry } = item;

  // Hidden events stay reachable — a session's capability list is worth seeing
  // when something is behaving oddly, just not inline in a conversation.
  if (entry.kind === "hidden" && !raw) {
    return (
      <li className="text-[11px] text-neutral-400">
        <button type="button" onClick={() => setRaw(true)} className="underline">
          {item.type}
        </button>
      </li>
    );
  }

  return (
    <li className="text-sm">
      {entry.kind === "said" && (
        <div
          className={
            entry.who === "operator"
              ? "rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800"
              : ""
          }
        >
          <p className="mb-1 text-xs text-neutral-500">
            {entry.who === "operator" ? "You" : "Agent"}
          </p>
          <Body text={entry.text} />
        </div>
      )}

      {entry.kind === "thinking" && (
        <div className="border-l-2 border-neutral-300 pl-3 text-neutral-500 italic dark:border-neutral-700">
          <Body text={entry.text} />
        </div>
      )}

      {entry.kind === "tool" && (
        <div>
          <p className="mb-1 text-xs text-neutral-500">ran {entry.name}</p>
          <pre className="overflow-x-auto rounded bg-neutral-100 p-2 font-mono text-xs break-words whitespace-pre-wrap dark:bg-neutral-800">
            {entry.summary}
          </pre>
        </div>
      )}

      {entry.kind === "output" && (
        <div
          className={`rounded p-2 ${
            entry.failed
              ? "bg-red-50 text-red-900 dark:bg-red-950/50 dark:text-red-200"
              : "bg-neutral-50 dark:bg-neutral-900"
          }`}
        >
          <Body text={entry.text} mono />
        </div>
      )}

      {entry.kind === "asked" && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          asked to run {entry.name}: {entry.summary}
        </p>
      )}

      {entry.kind === "status" && (
        <p className="text-xs text-neutral-500">
          {entry.text}
          {entry.error && (
            <span className="mt-1 block text-red-700 dark:text-red-300">
              {entry.error}
            </span>
          )}
        </p>
      )}

      {entry.kind === "note" && (
        <p className="text-[11px] text-neutral-400">{entry.text}</p>
      )}

      <button
        type="button"
        onClick={() => setRaw((v) => !v)}
        className="mt-1 text-[11px] text-neutral-400 underline"
      >
        {raw ? "hide raw" : "raw"}
      </button>
      {raw && (
        <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-[11px] break-words whitespace-pre-wrap dark:bg-white/5">
          {JSON.stringify(item.raw, null, 2)}
        </pre>
      )}
    </li>
  );
}
