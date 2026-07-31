import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getConfig } from "@agent-console/core/env";
import { getDatabase } from "@agent-console/core/db";
import { getMission, listEvents } from "@agent-console/core/missions";
import {
  getSession,
  launchMission,
  runningCount,
  stopMission,
} from "@agent-console/core/agents/manager";
import type { StoredEvent } from "@agent-console/core/missions";
import { formatSseEvent, parseSince } from "@agent-console/core/sse";
import { answerPromptSchema, launchMissionSchema } from "@agent-console/core/protocol";
import { matchRoute } from "./routes";

// A transcript stream never ends on its own, so server.close() would wait for
// one forever. Shutdown ends them itself rather than hanging until the
// supervisor loses patience and sends SIGKILL.
const openStreams = new Set<() => void>();

const HEARTBEAT_MS = 25_000;
const MAX_BODY_BYTES = 1_000_000;

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // An unbounded read is a memory exhaustion primitive, loopback or not.
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  missionId: string,
  since: number,
): void {
  const db = getDatabase();
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  let cursor = since;
  let replaying = true;
  const buffered: StoredEvent[] = [];

  // Subscribing before the replay, not after: an event emitted between reading
  // the table and attaching the listener would otherwise be delivered to
  // nobody, and the reader would sit waiting for a message already gone.
  const session = getSession(missionId);
  const unsubscribe = session?.subscribe((event) => {
    if (replaying) {
      buffered.push(event);
      return;
    }
    if (event.seq <= cursor) return;
    cursor = event.seq;
    response.write(formatSseEvent(event));
  });

  // Replay the gap, so a reader that dropped resumes exactly where it was.
  for (const event of listEvents(db, missionId, since)) {
    response.write(formatSseEvent(event));
    cursor = event.seq;
  }

  replaying = false;
  for (const event of buffered) {
    if (event.seq <= cursor) continue;
    cursor = event.seq;
    response.write(formatSseEvent(event));
  }

  const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), HEARTBEAT_MS);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe?.();
    openStreams.delete(close);
    response.end();
  };

  openStreams.add(close);
  request.on("close", close);
  // A finished mission has no session to subscribe to; the replay was the answer.
  if (!session) close();
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://agentd.local");
  const route = matchRoute({ method: request.method ?? "GET", pathname: url.pathname });

  if (route.kind === "health") {
    json(response, 200, { ok: true, running: runningCount() });
    return;
  }

  if (route.kind === "launch") {
    const parsed = launchMissionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      json(response, 400, { error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    json(response, 201, { id: await launchMission(parsed.data) });
    return;
  }

  if (route.kind === "unknown") {
    json(response, 404, { error: "not_found" });
    return;
  }

  if (!getMission(getDatabase(), route.id)) {
    json(response, 404, { error: "not_found" });
    return;
  }

  if (route.action === "events") {
    streamEvents(
      request,
      response,
      route.id,
      parseSince(url.searchParams.get("since")),
    );
    return;
  }

  // Stopping is idempotent and must work for a mission whose session is
  // already gone — otherwise a half-dead mission can never be cleaned up.
  if (route.action === "stop") {
    await stopMission(route.id);
    json(response, 200, { ok: true });
    return;
  }

  const session = getSession(route.id);
  if (!session) {
    json(response, 409, { error: "session_not_running" });
    return;
  }

  if (route.action === "interrupt") {
    await session.interrupt();
    json(response, 200, { ok: true });
    return;
  }

  const parsed = answerPromptSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    json(response, 400, { error: "invalid_request", issues: parsed.error.issues });
    return;
  }
  const handled = session.answer(
    parsed.data.promptId,
    parsed.data.decision === "allow"
      ? { behavior: "allow" }
      : { behavior: "deny", message: parsed.data.message },
  );
  json(
    response,
    handled ? 200 : 409,
    handled ? { ok: true } : { error: "prompt_not_pending" },
  );
}

const config = getConfig();

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    if (!response.headersSent) {
      json(response, 500, { error: error instanceof Error ? error.message : "failed" });
      return;
    }
    response.end();
  });
});

// Loopback only, and not negotiable by accident: this speaks for every agent on
// the box and has no authentication of its own — that lives in the web app.
// Exposing it is handing an unauthenticated agent runner to the network.
server.listen(config.agentdPort, "127.0.0.1", () => {
  process.stdout.write(`agentd listening on 127.0.0.1:${config.agentdPort}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    for (const endStream of [...openStreams]) endStream();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
