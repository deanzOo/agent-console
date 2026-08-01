import { getConfig } from "@agent-console/core/env";

// One module owns the fact that the session host is reachable over HTTP. Every
// caller speaks missions, answers and interrupts — not fetch, ports or status
// codes — so moving agentd elsewhere touches this file and nothing else.

export type AgentdOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "unreachable" }
  | {
      readonly ok: false;
      readonly reason: "rejected";
      readonly status: number;
      readonly body: unknown;
    };

export interface LaunchInput {
  readonly title: string;
  readonly prompt: string;
  readonly source: "free" | "github" | "asana";
  readonly sourceRef?: string | undefined;
  readonly repo?: string | undefined;
  readonly base?: string | undefined;
}

export type Answer =
  | { readonly promptId: string; readonly decision: "allow" }
  | { readonly promptId: string; readonly decision: "deny"; readonly message: string };

function baseUrl(): string {
  return `http://127.0.0.1:${getConfig().agentdPort}`;
}

// A restarting session host is not a failure of the mission — the agent is
// still parked in a process that is merely coming back. Callers distinguish it
// so the operator is told "unreachable" rather than "your mission died".
async function send<T>(
  path: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<AgentdOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, init);
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "rejected",
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }

  return { ok: true, value: await read(response) };
}

const asJson = (response: Response): Promise<unknown> => response.json();

export function launchMission(input: LaunchInput): Promise<AgentdOutcome<unknown>> {
  return send(
    "/missions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    asJson,
  );
}

export function answerPrompt(
  missionId: string,
  answer: Answer,
): Promise<AgentdOutcome<unknown>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/answer`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer),
    },
    asJson,
  );
}

export function stopMission(missionId: string): Promise<AgentdOutcome<unknown>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/stop`,
    { method: "POST" },
    asJson,
  );
}

export function sayToMission(
  missionId: string,
  text: string,
): Promise<AgentdOutcome<unknown>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/say`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    },
    asJson,
  );
}

export function setMissionMode(
  missionId: string,
  mode: string,
): Promise<AgentdOutcome<unknown>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/mode`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    },
    asJson,
  );
}

export function interruptMission(missionId: string): Promise<AgentdOutcome<unknown>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/interrupt`,
    { method: "POST" },
    asJson,
  );
}

// The transcript is proxied rather than re-implemented: agentd already replays
// from the database and then tails the live session, and two cursors would be
// two chances to drop an event.
export function streamEvents(
  missionId: string,
  since: number,
  signal: AbortSignal,
): Promise<AgentdOutcome<ReadableStream<Uint8Array> | null>> {
  return send(
    `/missions/${encodeURIComponent(missionId)}/events?since=${since}`,
    { signal },
    async (response) => response.body,
  );
}
