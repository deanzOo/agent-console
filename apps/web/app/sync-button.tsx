"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// How long the result stays up before the button goes quiet again. Long enough
// to read on a phone, short enough not to become furniture.
const RESULT_MS = 6000;

interface SyncResult {
  readonly issues?: number;
  readonly repos?: number;
  readonly tasks?: number;
  readonly workspaces?: number;
}

function summarise(result: SyncResult): string {
  const parts: string[] = [];
  if (typeof result.issues === "number") {
    parts.push(`${result.issues} issue${result.issues === 1 ? "" : "s"}`);
  }
  if (typeof result.tasks === "number") {
    parts.push(`${result.tasks} task${result.tasks === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "nothing to sync";
}

export function SyncButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<{ text: string; failed: boolean } | undefined>();
  // The refresh is part of the wait: the lists are rendered on the server, so
  // the work is not finished when the request returns.
  const [refreshing, startRefresh] = useTransition();

  const busy = running || refreshing;

  async function sync() {
    setRunning(true);
    setNote(undefined);

    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result: SyncResult = await response.json().catch(() => ({}));

      // Partial failures are reported per integration; surface the first.
      const failure = Object.entries(result).find(([key]) => key.endsWith("Error"));
      setNote(
        failure
          ? { text: String(failure[1]), failed: true }
          : { text: summarise(result), failed: false },
      );
      startRefresh(() => router.refresh());
    } catch {
      setNote({ text: "Sync failed", failed: true });
    } finally {
      setRunning(false);
      setTimeout(() => setNote(undefined), RESULT_MS);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {note && (
        <span
          className={`text-xs ${note.failed ? "text-red-600" : "text-neutral-500"}`}
          role="status"
        >
          {note.text}
        </span>
      )}
      <button
        type="button"
        onClick={() => void sync()}
        disabled={busy}
        aria-busy={busy}
        className="flex items-center gap-1.5 text-xs underline disabled:no-underline disabled:opacity-70"
      >
        {busy && (
          /* A moving thing, because six seconds of unchanged text reads as a
             button that did not register the tap. */
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border border-neutral-400 border-t-transparent"
          />
        )}
        {busy ? "Syncing…" : "Sync"}
      </button>
    </span>
  );
}
