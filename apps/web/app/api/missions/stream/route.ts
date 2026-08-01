import { getDatabase } from "@agent-console/core/db";
import { statusSignature, STATUS_POLL_MS } from "@agent-console/core/mission-feed";
import { HEARTBEAT_MS, SSE_HEADERS } from "@agent-console/core/sse";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const db = getDatabase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let signature = statusSignature(db);
      let closed = false;

      const poll = setInterval(() => {
        const next = statusSignature(db);
        if (next === signature) return;
        signature = next;
        controller.enqueue(encoder.encode("event: missions.changed\ndata: {}\n\n"));
      }, STATUS_POLL_MS);

      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
        HEARTBEAT_MS,
      );

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
