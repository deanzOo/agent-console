"use client";

import { useEffect, useRef, useState } from "react";
import type { OpenPrompt, StoredEvent } from "@/lib/missions";

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
            kind: "tool_approval",
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
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

      {prompts.map((prompt) => (
        <section
          key={prompt.id}
          className="rounded border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/40"
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

      <ol className="space-y-2">
        {events.map((event) => (
          <li
            key={event.seq}
            className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
          >
            <span className="text-neutral-500">{event.type}</span>
            <pre className="mt-1 overflow-x-auto break-words whitespace-pre-wrap">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </li>
        ))}
      </ol>
      <div ref={bottom} />
    </main>
  );
}
