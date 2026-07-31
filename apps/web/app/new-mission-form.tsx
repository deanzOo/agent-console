"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewMissionForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const response = await fetch("/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: prompt.split("\n")[0]?.slice(0, 80) || "Untitled mission",
        prompt,
        source: "free",
        ...(repo.trim() ? { repo: repo.trim() } : {}),
      }),
    });

    setBusy(false);

    if (!response.ok) {
      setError(`Could not start the mission (${response.status}).`);
      return;
    }

    const { id } = await response.json();
    router.push(`/missions/${id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded border border-dashed border-neutral-300 py-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
      >
        Start a mission
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800"
    >
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="What should the agent do?"
        rows={3}
        required
        className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      <input
        value={repo}
        onChange={(event) => setRepo(event.target.value)}
        placeholder="owner/repo (optional)"
        className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || prompt.trim() === ""}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
