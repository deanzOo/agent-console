"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>();

  async function sync() {
    setBusy(true);
    setNote(undefined);

    const response = await fetch("/api/sync", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    // Partial failures are reported per integration; surface the first.
    const failure = Object.entries(result).find(([key]) => key.endsWith("Error"));
    setNote(failure ? String(failure[1]) : undefined);
    router.refresh();
  }

  return (
    <span className="flex items-center gap-2">
      {note && <span className="text-xs text-red-600">{note}</span>}
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="text-xs underline disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync"}
      </button>
    </span>
  );
}
