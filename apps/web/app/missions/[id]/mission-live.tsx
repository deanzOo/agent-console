"use client";

import { useEffect, useRef, useState } from "react";
import { toTranscript } from "@agent-console/core/transcript";
import { TranscriptRow } from "./transcript-row";

// Close enough to the end that the reader is following along rather than
// reading back through what already happened.
const FOLLOW_THRESHOLD_PX = 120;
import type { OpenPrompt, StoredEvent } from "@agent-console/core/missions";
import { PROMPT_KIND } from "@agent-console/core/schema";

interface MissionView {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly repo: string | null;
  readonly branch: string | null;
}

export function MissionLive({
  mission,
  initialEvents,
  initialPrompts,
}: {
  mission: MissionView;
  initialEvents: StoredEvent[];
  initialPrompts: OpenPrompt[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [prompts, setPrompts] = useState(initialPrompts);
  const [status, setStatus] = useState(mission.status);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const since = events.at(-1)?.seq ?? 0;
    const source = new EventSource(`/api/missions/${mission.id}/stream?since=${since}`);

    source.onmessage = () => undefined;
    source.addEventListener("error", () => undefined);

    const handle = (raw: MessageEvent<string>) => {
      const event: StoredEvent = JSON.parse(raw.data);
      setEvents((current) =>
        current.some((existing) => existing.seq === event.seq)
          ? current
          : [...current, event],
      );

      if (event.type === "mission.status") {
        const next = Object(event.payload).status;
        if (typeof next === "string") setStatus(next);
      }
      if (event.type === "mission.prompt") {
        const payload = Object(event.payload);
        setPrompts((current) => [
          ...current,
          {
            id: payload.promptId,
            kind: PROMPT_KIND.TOOL_APPROVAL,
            toolName: payload.toolName ?? null,
            input: payload.input,
            options: null,
            createdAt: event.ts,
          },
        ]);
      }
    };

    for (const type of ["mission.status", "mission.prompt", "mission.created"]) {
      source.addEventListener(type, handle);
    }
    // Agent messages arrive under their own type names.
    source.addEventListener("agent.assistant", handle);
    source.addEventListener("agent.system", handle);
    source.addEventListener("agent.result", handle);
    source.addEventListener("agent.user", handle);

    return () => source.close();
    // Subscribing once per mission is deliberate; the cursor is read at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id]);

  // Follow the tail only when the reader is already there. Scrolling them back
  // down after every message makes reading anything above impossible, and each
  // approval produces several.
  useEffect(() => {
    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.body.scrollHeight - FOLLOW_THRESHOLD_PX;
    if (nearBottom) bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  async function answer(promptId: string, decision: "allow" | "deny") {
    setPrompts((current) => current.filter((prompt) => prompt.id !== promptId));
    await fetch(`/api/missions/${mission.id}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ promptId, decision }),
    });
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{mission.title}</h1>
        <p className="text-xs text-neutral-500">
          {status.replace("_", " ")}
          {mission.repo ? ` · ${mission.repo}` : ""}
          {mission.branch ? ` · ${mission.branch}` : ""}
        </p>
      </header>

      <ol className="space-y-3">
        {toTranscript(events).map((item) => (
          <TranscriptRow key={item.seq} item={item} />
        ))}
      </ol>
      <div ref={bottom} />

      {/* Pinned to the bottom of the viewport: an approval that only exists at
          the top of a long transcript has to be hunted for, and answering one
          appends more output that moves it further away. */}
      {prompts.map((prompt) => (
        <section
          key={prompt.id}
          className="sticky bottom-0 z-10 rounded border border-amber-400 bg-amber-50 p-3 shadow-lg dark:bg-amber-950 dark:shadow-black/40"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <p className="text-sm font-medium">
            Waiting on you: {prompt.toolName ?? "a question"}
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5">
            {JSON.stringify(prompt.input, null, 2)}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => answer(prompt.id, "allow")}
              className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
            >
              Allow
            </button>
            <button
              onClick={() => answer(prompt.id, "deny")}
              className="rounded border border-neutral-400 px-3 py-2 text-sm"
            >
              Deny
            </button>
          </div>
        </section>
      ))}
    </main>
  );
}
