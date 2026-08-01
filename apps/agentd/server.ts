import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { getConfig } from "@agent-console/core/env";
import { getDatabase } from "@agent-console/core/db";
import { getMission, listEvents, openPrompts } from "@agent-console/core/missions";
import {
  getSession,
  launchMission,
  runningCount,
  stopMission,
} from "@agent-console/core/agents/manager";
import type { StoredEvent } from "@agent-console/core/missions";
import { reconcileOrphans } from "@agent-console/core/agents/orphans";
import { recoverMissions } from "@agent-console/core/agents/manager";
import { formatSseEvent, HEARTBEAT_MS, parseSince } from "@agent-console/core/sse";
import { answerPromptSchema, launchMissionSchema } from "@agent-console/core/protocol";
import { matchRoute } from "./routes";

// A transcript stream never ends on its own, so server.close() would wait for
// one forever. Shutdown ends them itself rather than hanging until the
// supervisor loses patience and sends SIGKILL.
const openStreams = new Set<() => void>();

// A sentinel rather than a throw: the parse failure is expected input, and
// unwinding for it would be indistinguishable from a real fault.
const MALFORMED = Symbol("malformed-json");

const saySchema = z.object({ text: z.string().trim().min(1).max(10_000) });

// bypassPermissions is deliberately absent: it would make an approval console
// pointless, and the agent has a shell in a container holding a git token.
const modeSchema = z.object({ mode: z.enum(["default", "acceptEdits", "plan"]) });

const MAX_BODY_BYTES = 1_000_000;

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

// A write to a stream the client already dropped throws EPIPE, and these
// writes happen in a timer and a subscription callback — outside any request
// handler, so the exception is uncaught and takes the process down. This host
// holds every live mission, so one disconnected phone must not end them all.
function safeWrite(response: ServerResponse, chunk: string): void {
  if (response.destroyed || response.writableEnded) return;
  try {
    response.write(chunk);
  } catch {
    response.destroy();
  }
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
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    // Malformed input is the caller's mistake, so it reads as one rather than
    // bubbling to the error boundary and being reported as a server fault.
    return MALFORMED;
  }
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
    safeWrite(response, formatSseEvent(event));
  });

  // Replay the gap, so a reader that dropped resumes exactly where it was.
  for (const event of listEvents(db, missionId, since)) {
    safeWrite(response, formatSseEvent(event));
    cursor = event.seq;
  }

  replaying = false;
  for (const event of buffered) {
    if (event.seq <= cursor) continue;
    cursor = event.seq;
    safeWrite(response, formatSseEvent(event));
  }

  const heartbeat = setInterval(
    () => safeWrite(response, ": keep-alive\n\n"),
    HEARTBEAT_MS,
  );

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe?.();
    openStreams.delete(close);
    response.end();
  };

  openStreams.add(close);
  request.on("close", close);
  // A dropped connection surfaces as an error on either half; without a
  // listener Node treats it as unhandled and ends the process.
  request.on("error", close);
  response.on("error", close);
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
    const body = await readJson(request);
    const parsed = body === MALFORMED ? undefined : launchMissionSchema.safeParse(body);
    if (!parsed) {
      json(response, 400, { error: "invalid_json" });
      return;
    }
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

  if (route.action === "say") {
    const body = await readJson(request);
    const parsed = body === MALFORMED ? undefined : saySchema.safeParse(body);
    if (!parsed?.success) {
      json(response, 400, { error: "invalid_request" });
      return;
    }
    json(response, session.say(parsed.data.text) ? 200 : 409, { ok: true });
    return;
  }

  if (route.action === "mode") {
    const body = await readJson(request);
    const parsed = body === MALFORMED ? undefined : modeSchema.safeParse(body);
    if (!parsed?.success) {
      json(response, 400, { error: "invalid_mode" });
      return;
    }
    const changed = await session.setMode(parsed.data.mode);
    json(response, changed ? 200 : 409, { ok: changed });
    return;
  }

  if (route.action === "interrupt") {
    await session.interrupt();
    json(response, 200, { ok: true });
    return;
  }

  const body = await readJson(request);
  const parsed = body === MALFORMED ? undefined : answerPromptSchema.safeParse(body);
  if (!parsed) {
    json(response, 400, { error: "invalid_json" });
    return;
  }
  if (!parsed.success) {
    json(response, 400, { error: "invalid_request", issues: parsed.error.issues });
    return;
  }
  // Remembered before the answer, so the tool the operator just approved is
  // already allowed if the agent asks for it again immediately.
  if (parsed.data.decision === "allow" && parsed.data.always) {
    const prompt = openPrompts(getDatabase(), route.id).find(
      (open) => open.id === parsed.data.promptId,
    );
    if (prompt?.toolName) session.alwaysAllow(prompt.toolName);
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

// The registry is empty at startup by definition, so anything the database
// still calls live is a mission whose session died with the last process.
// Leaving them alone strands the operator: the console offers approvals that
// answer with session_not_running, and the mission can be neither advanced nor
// dismissed.
// Prompts left open on a mission that already finished can never be answered
// either, so they are closed regardless of what happens to the live ones.
reconcileOrphans(getDatabase());

// Missions interrupted by the last restart come back where they can, rather
// than being lost to a deploy.
void recoverMissions().then(({ resumed, stopped }) => {
  if (resumed > 0 || stopped > 0) {
    process.stdout.write(`agentd: resumed ${resumed}, stopped ${stopped}\n`);
  }
});

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    // Logged as well as returned: the response goes to whoever asked, and when
    // that is a fetch inside a route handler the reason is lost the moment the
    // request ends. This is the only place that keeps it.
    process.stderr.write(
      `agentd: ${request.method} ${request.url} failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
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
