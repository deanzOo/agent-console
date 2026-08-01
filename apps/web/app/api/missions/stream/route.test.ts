import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const statusSignature = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/mission-feed", () => ({
  statusSignature,
  STATUS_POLL_MS: 1000,
}));

const { GET } = await import("./route");

/** Reads whatever the stream has produced so far without waiting for its end. */
async function drain(response: Response, ticks: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  let text = "";
  const decoder = new TextDecoder();
  for (let tick = 0; tick < ticks; tick += 1) {
    await vi.advanceTimersByTimeAsync(1000);
    const chunk = await Promise.race([
      reader.read(),
      Promise.resolve({ value: undefined, done: false }),
    ]);
    if (chunk.value) text += decoder.decode(chunk.value);
  }
  return text;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/missions/stream", () => {
  it("declares itself as an event stream that must not be buffered", () => {
    statusSignature.mockReturnValue("m1:running");

    const response = GET(new Request("http://localhost/api/missions/stream"));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    // Without this a proxy holds the stream until it has enough to send, which
    // is indistinguishable from nothing happening.
    expect(response.headers.get("x-accel-buffering")).toBe("no");
  });

  it("says nothing while no mission changes status", async () => {
    statusSignature.mockReturnValue("m1:running");

    const text = await drain(GET(new Request("http://localhost/x")), 3);

    expect(text).not.toContain("missions.changed");
  });

  it("emits when a mission changes status", async () => {
    statusSignature.mockReturnValueOnce("m1:running").mockReturnValue("m1:done");

    const text = await drain(GET(new Request("http://localhost/x")), 2);

    expect(text).toContain("event: missions.changed");
  });

  // The browser reconnects on its own; a stream left polling after the reader
  // is gone would keep a timer per abandoned tab.
  it("stops polling when the client goes away", async () => {
    statusSignature.mockReturnValue("m1:running");
    const controller = new AbortController();

    GET(new Request("http://localhost/x", { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(1000);
    const polled = statusSignature.mock.calls.length;

    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);

    expect(statusSignature.mock.calls.length).toBe(polled);
  });
});
