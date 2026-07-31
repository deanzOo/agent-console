import { getDatabase } from "@agent-console/core/db";
import { getMission, listEvents } from "@agent-console/core/missions";
import { formatSseEvent, parseSince } from "@agent-console/core/sse";
import { streamEvents } from "@/lib/agentd";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

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

  const outcome = await streamEvents(id, since, request.signal);
  if (outcome.ok && outcome.value) {
    return new Response(outcome.value, { headers: SSE_HEADERS });
  }

  // A refusal is a real error and is surfaced as one. Only an unreachable host
  // falls through to a replay, because only then is the mission still fine.
  if (!outcome.ok && outcome.reason === "rejected") {
    return Response.json(outcome.body ?? { error: "stream_failed" }, {
      status: outcome.status,
    });
  }

  // The session host is restarting. The transcript so far still exists, so
  // replay it and say so, rather than showing an empty or broken stream.
  const encoder = new TextEncoder();
  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of listEvents(db, id, since)) {
        controller.enqueue(encoder.encode(formatSseEvent(event)));
      }
      controller.enqueue(encoder.encode("event: agentd.unreachable\ndata: {}\n\n"));
      controller.close();
    },
  });

  return new Response(replay, { headers: SSE_HEADERS });
}
