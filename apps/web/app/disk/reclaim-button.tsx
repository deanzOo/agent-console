"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  readonly url: string;
  readonly confirmText: string;
}

// Shared by a mission's recorded worktree and a tree with no mission row: both
// are "delete this directory", they just reach different routes because only
// one of them has a mission status to refuse against.
export function ReclaimButton({ url, confirmText }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reclaim() {
    if (!confirm(confirmText)) return;

    setBusy(true);
    setError("");
    const response = await fetch(url, { method: "DELETE" });
    setBusy(false);

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      setError(String(Object(body).error ?? `failed (${response.status})`));
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => void reclaim()}
        disabled={busy}
        className="shrink-0 rounded border border-red-400 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:text-red-300"
      >
        Reclaim
      </button>
    </span>
  );
}
