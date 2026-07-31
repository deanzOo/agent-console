import { getDatabase } from "@agent-console/core/db";
import { getMission, listEvents } from "@agent-console/core/missions";
import { getSession } from "@agent-console/core/agents/manager";
import { formatSseEvent, parseSince } from "@agent-console/core/sse";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDatabase();

  if (!getMission(db, id)) {
    return new Response("Not found", { status: 404 });
  }

  // Last-Event-ID is what the browser resends on an automatic reconnect.
  const url = new URL(request.url);
  const since = parseSince(
    request.headers.get("last-event-id") ?? url.searchParams.get("since"),
  );

  const encoder = new TextEncoder();
  const session = getSession(id);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      // Replay the gap first. A phone that slept resumes exactly where it was.
      let cursor = since;
      for (const event of listEvents(db, id, since)) {
        send(formatSseEvent(event));
        cursor = event.seq;
      }

      const unsubscribe = session?.subscribe((event) => {
        if (event.seq <= cursor) return;
        cursor = event.seq;
        send(formatSseEvent(event));
      });

      // Proxies drop an idle connection; a comment frame is not an event.
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        controller.close();
      };

      request.signal.addEventListener("abort", close, { once: true });
      if (!session) close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
