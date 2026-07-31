"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartFromSource({
  source,
  sourceRef,
  repo,
  title,
  prompt,
}: {
  source: "github" | "asana";
  sourceRef: string;
  repo?: string;
  title: string;
  prompt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setBusy(true);
    setError(false);

    const response = await fetch("/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.slice(0, 200),
        prompt,
        source,
        sourceRef,
        ...(repo ? { repo } : {}),
      }),
    });

    if (!response.ok) {
      setBusy(false);
      setError(true);
      return;
    }

    const { id } = await response.json();
    router.push(`/missions/${id}`);
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="shrink-0 rounded border border-neutral-400 px-2 py-1 text-xs disabled:opacity-50"
    >
      {busy ? "Starting…" : error ? "Retry" : "Send Claude"}
    </button>
  );
}
