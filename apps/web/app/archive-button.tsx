"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  readonly missionId: string;
  readonly archived: boolean;
}

export function ArchiveButton({ missionId, archived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/missions/${missionId}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setBusy(false);
    // The list is rendered on the server, so it only changes when that reruns.
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className="rounded border border-neutral-300 px-2 py-1 text-xs whitespace-nowrap disabled:opacity-50 dark:border-neutral-700"
    >
      {archived ? "Restore" : "Archive"}
    </button>
  );
}
