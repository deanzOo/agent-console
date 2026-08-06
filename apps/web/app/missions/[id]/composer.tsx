"use client";

import { useState } from "react";

const MODES = [
  { value: "default", label: "Ask" },
  { value: "acceptEdits", label: "Auto edits" },
  { value: "plan", label: "Plan" },
] as const;

interface Props {
  readonly missionId: string;
  readonly live: boolean;
  readonly initialMode: string;
}

// Sits at the bottom, next to where an approval pins: the two things you do to
// a running agent belong in the same place, under your thumb.
export function Composer({ missionId, live, initialMode }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!live) return null;

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/missions/${missionId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!response.ok) {
      const failed: unknown = await response.json().catch(() => ({}));
      setError(String(Object(failed).error ?? `failed (${response.status})`));
      return false;
    }
    return true;
  }

  async function send() {
    const message = text.trim();
    if (message === "") return;
    // Cleared immediately: the message arrives in the transcript, so leaving it
    // in the box would show it twice.
    if (await post("say", { text: message })) setText("");
  }

  async function changeMode(next: string) {
    const previous = mode;
    setMode(next);
    if (!(await post("mode", { mode: next }))) setMode(previous);
  }

  return (
    <div
      className="sticky bottom-0 space-y-2 border-t border-neutral-200 bg-white pt-2 dark:border-neutral-800 dark:bg-neutral-950"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-neutral-500">Mode</span>
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => void changeMode(option.value)}
            disabled={busy}
            className={`rounded px-2 py-1 ${
              mode === option.value
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {option.label}
          </button>
        ))}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; a newline needs a modifier. On a phone the send
            // button is the real target, but a keyboard should not need it.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Say something to the agent"
          className="min-h-[2.5rem] flex-1 resize-y rounded border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || text.trim() === ""}
          className="rounded bg-neutral-900 px-3 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Send
        </button>
      </div>
    </div>
  );
}
