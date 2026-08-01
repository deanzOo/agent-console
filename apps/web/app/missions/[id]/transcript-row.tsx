"use client";

import { useState } from "react";
import type { TranscriptGroup, TranscriptItem } from "@agent-console/core/transcript";

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

function Raw({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Beside the content, not under it: a row per toggle is a row to scroll
          past, and there is one on every entry. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="float-right ml-2 text-[11px] text-neutral-400 underline"
        aria-label="Show the raw event"
      >
        {open ? "hide" : "raw"}
      </button>
      {open && (
        <pre className="clear-both mt-1 overflow-x-auto rounded bg-black/5 p-2 text-[11px] break-words whitespace-pre-wrap dark:bg-white/5">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </>
  );
}

/** A run of hidden events as one line: "agent.system (164)", still openable. */
function Collapsed({ label, items }: { label: string; items: TranscriptItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="text-[11px] text-neutral-400">
      <button type="button" onClick={() => setOpen((v) => !v)} className="underline">
        {label}
        {items.length > 1 ? ` (${items.length})` : ""}
      </button>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-black/5 p-2 break-words whitespace-pre-wrap dark:bg-white/5">
          {items.map((item) => JSON.stringify(item.raw, null, 2)).join("\n\n")}
        </pre>
      )}
    </li>
  );
}

// Lines shown before the diff is clipped. A large edit is common and pushes
// the conversation off a phone screen otherwise.
const CLIPPED_DIFF_LINES = 16;

function Edit({
  entry,
}: {
  entry: { path: string; removed: string[]; added: string[] };
}) {
  const [open, setOpen] = useState(false);
  const lines = [
    ...entry.removed.map((text) => ({ sign: "-", text })),
    ...entry.added.map((text) => ({ sign: "+", text })),
  ];
  const long = lines.length > CLIPPED_DIFF_LINES;
  const shown = open || !long ? lines : lines.slice(0, CLIPPED_DIFF_LINES);

  return (
    <div>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="font-mono break-all">{entry.path}</span>
        <span>
          <span className="text-green-700 dark:text-green-400">
            +{entry.added.length}
          </span>{" "}
          <span className="text-red-700 dark:text-red-400">
            −{entry.removed.length}
          </span>
        </span>
      </p>
      <pre className="overflow-x-auto rounded bg-neutral-50 p-2 font-mono text-xs dark:bg-neutral-900">
        {shown.map((line, index) => (
          <div
            key={index}
            className={
              line.sign === "+"
                ? "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200"
                : "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200"
            }
          >
            <span className="break-words whitespace-pre-wrap">
              {line.sign} {line.text}
            </span>
          </div>
        ))}
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
    </div>
  );
}

function Entry({ item }: { item: TranscriptItem }) {
  const { entry } = item;

  return (
    <li className="text-sm">
      <Raw value={item.raw} />

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

      {entry.kind === "edit" && <Edit entry={entry} />}

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
    </li>
  );
}

export function TranscriptRow({ group }: { group: TranscriptGroup }) {
  return group.kind === "collapsed" ? (
    <Collapsed label={group.label} items={group.items} />
  ) : (
    <Entry item={group.item} />
  );
}
