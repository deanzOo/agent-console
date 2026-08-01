import { beforeEach, describe, expect, it, vi } from "vitest";

const getMission = vi.fn();
const listEvents = vi.fn();
const streamEvents = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/missions", () => ({ getMission, listEvents }));
vi.mock("@/lib/agentd", () => ({ streamEvents }));

const { GET } = await import("./route");

function get(url = "http://localhost/api/missions/m1/stream") {
  return GET(new Request(url), { params: Promise.resolve({ id: "m1" }) });
}

async function read(response: Response): Promise<string> {
  return response.body ? new Response(response.body).text() : "";
}

beforeEach(() => {
  vi.clearAllMocks();
  getMission.mockReturnValue({ id: "m1" });
  listEvents.mockReturnValue([]);
  streamEvents.mockResolvedValue({ ok: true, value: new ReadableStream() });
});

describe("GET /api/missions/[id]/stream", () => {
  it("hands back the session host's stream", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("is a 404 for a mission that does not exist", async () => {
    getMission.mockReturnValue(undefined);

    expect((await get()).status).toBe(404);
    expect(streamEvents).not.toHaveBeenCalled();
  });

  // Last-Event-ID is what the browser resends by itself after a phone sleeps,
  // so honouring it is what makes reconnecting lossless.
  it("resumes from the cursor the browser sends back", async () => {
    await GET(
      new Request("http://localhost/x", { headers: { "last-event-id": "42" } }),
      { params: Promise.resolve({ id: "m1" }) },
    );

    expect(streamEvents).toHaveBeenCalledWith("m1", 42, expect.anything());
  });

  it("falls back to the query string when there is no header", async () => {
    await get("http://localhost/x?since=7");

    expect(streamEvents).toHaveBeenCalledWith("m1", 7, expect.anything());
  });

  // A restart of the session host loses the live stream but not the
  // transcript, so the operator gets what happened plus a note saying why it
  // stopped — rather than an empty screen.
  it("replays the transcript when the session host is unreachable", async () => {
    streamEvents.mockResolvedValue({ ok: false, reason: "unreachable" });
    listEvents.mockReturnValue([
      { seq: 1, type: "agent.assistant", payload: { text: "hello" } },
    ]);

    const body = await read(await get());

    expect(body).toContain("agent.assistant");
    expect(body).toContain("agentd.unreachable");
  });

  // A refusal is a real error. Replaying over it would present a broken
  // request as a mission that simply stopped.
  it("passes a refusal through instead of replaying", async () => {
    streamEvents.mockResolvedValue({
      ok: false,
      reason: "rejected",
      status: 409,
      body: { error: "session_not_running" },
    });

    const response = await get();

    expect(response.status).toBe(409);
    expect(listEvents).not.toHaveBeenCalled();
  });
});
