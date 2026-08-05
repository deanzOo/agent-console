"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LIVE = ["starting", "running", "awaiting_input"];

interface Props {
  readonly missionId: string;
  readonly status: string;
  readonly hasWorktree: boolean;
  readonly hasSession: boolean;
}

export function MissionActions({ missionId, status, hasWorktree, hasSession }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = LIVE.includes(status);
  // Recovery only ever leaves a mission `stopped`, never `failed` — a failed
  // mission errored out mid-run rather than being declined a resume, so there
  // is nothing here for a resume to act on. The server is the real judge of
  // whether the session and working tree are still there; this is only a
  // hint to avoid offering a button that can only fail.
  const canResume = status === "stopped" && hasSession && hasWorktree;

  async function act(path: string, method: string) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/missions/${missionId}${path}`, { method });
    setBusy(false);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      setError(String(Object(body).error ?? `failed (${response.status})`));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {live && (
        <button
          type="button"
          onClick={() => void act("/stop", "POST")}
          disabled={busy}
          className="rounded border border-neutral-400 px-2 py-1 text-xs disabled:opacity-50"
        >
          Stop
        </button>
      )}

      {canResume && (
        <button
          type="button"
          onClick={() => void act("/resume", "POST")}
          disabled={busy}
          className="rounded border border-neutral-400 px-2 py-1 text-xs disabled:opacity-50"
        >
          Resume
        </button>
      )}

      {/* Only offered once the mission is finished: the guard is enforced on the
          server too, but a button that can only fail is worse than no button. */}
      {!live && hasWorktree && (
        <button
          type="button"
          onClick={() => {
            if (
              confirm("Delete this mission's working tree? Uncommitted work is lost.")
            )
              void act("/workspace", "DELETE");
          }}
          disabled={busy}
          className="rounded border border-red-400 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:text-red-300"
        >
          Discard files
        </button>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
