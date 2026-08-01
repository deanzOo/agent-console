"use client";

import { useState } from "react";

const MESSAGES: Record<string, string> = {
  nothing_to_push: "This mission's branch has no commits on it.",
  no_branch: "This mission has no repository branch.",
  github_not_configured: "No GitHub token is configured.",
  "nothing to push": "This mission's branch has no commits on it.",
};

export function PublishButton({ missionId }: { missionId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function publish() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/missions/${missionId}/publish`, {
        method: "POST",
      });
      const body = await response.json();
      if (response.ok && typeof Object(body).url === "string") {
        setUrl(Object(body).url);
        return;
      }
      const reason = String(Object(body).error ?? response.status);
      setError(MESSAGES[reason] ?? reason);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">
        View the pull request
      </a>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        className="rounded border border-neutral-400 px-3 py-2 text-sm disabled:opacity-50"
      >
        {busy ? "Opening…" : "Push and open a PR"}
      </button>
      {error && <span className="text-xs text-red-700 dark:text-red-300">{error}</span>}
    </span>
  );
}
