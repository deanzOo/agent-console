import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getConfigMock = vi.fn(() => ({ agentdPort: 3100 }));
vi.mock("@agent-console/core/env", () => ({ getConfig: getConfigMock }));

const { answerPrompt, interruptMission, launchMission, streamEvents } =
  await import("./agentd");

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(body: unknown = { ok: true }) {
  return { ok: true, status: 200, json: async () => body, body: null };
}

function rejected(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

const launchInput = { title: "t", prompt: "p", source: "free" } as const;

describe("agentd client", () => {
  it("posts a launch to the session host and returns what it said", async () => {
    fetchMock.mockResolvedValue(ok({ id: "m1" }));

    const outcome = await launchMission(launchInput);

    expect(outcome).toEqual({ ok: true, value: { id: "m1" } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:3100/missions");
    expect(init).toMatchObject({ method: "POST" });
  });

  // The whole reason the session host is separate is that it restarts without
  // taking missions with it. A restart must not read as a failed mission.
  it("reports a refused connection as unreachable, not as a rejection", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await launchMission(launchInput)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("passes a rejection through with its status and body", async () => {
    fetchMock.mockResolvedValue(rejected(409, { error: "session_not_running" }));

    expect(await interruptMission("m1")).toEqual({
      ok: false,
      reason: "rejected",
      status: 409,
      body: { error: "session_not_running" },
    });
  });

  it("survives a rejection whose body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });

    expect(await interruptMission("m1")).toMatchObject({
      ok: false,
      reason: "rejected",
      status: 502,
      body: null,
    });
  });

  // Mission ids are uuids today, but this builds a URL from a value that
  // arrives in a request path, and encoding it is the difference between a
  // path segment and a new one.
  it("encodes the mission id into the path", async () => {
    fetchMock.mockResolvedValue(ok());

    await answerPrompt("a/../b", { promptId: "p1", decision: "allow" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:3100/missions/a%2F..%2Fb/answer",
    );
  });

  it("sends the cursor and the abort signal when streaming", async () => {
    const stream = new ReadableStream<Uint8Array>();
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: stream });
    const controller = new AbortController();

    const outcome = await streamEvents("m1", 42, controller.signal);

    expect(outcome).toEqual({ ok: true, value: stream });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:3100/missions/m1/events?since=42");
    expect(init).toMatchObject({ signal: controller.signal });
  });
});
