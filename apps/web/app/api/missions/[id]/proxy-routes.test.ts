import { beforeEach, describe, expect, it, vi } from "vitest";

// Five routes that differ only in which call they forward. Testing them together
// is what keeps the shared shape honest: a route that forgets to translate an
// unreachable session host, or answers before checking the mission exists,
// fails here rather than in the one place nobody wrote a test for.
const getMission = vi.fn();
// The answer route records the decision in the transcript as well as
// forwarding it, so it reaches for this one too.
const answerPrompt = vi.fn();

const client = {
  interruptMission: vi.fn(),
  stopMission: vi.fn(),
  resumeMission: vi.fn(),
  sayToMission: vi.fn(),
  setMissionMode: vi.fn(),
  answerPrompt: vi.fn(),
};

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/missions", () => ({ getMission, answerPrompt }));
vi.mock("@/lib/agentd", () => client);

interface Case {
  readonly name: string;
  readonly load: () => Promise<{ POST: Handler }>;
  readonly call: ReturnType<typeof vi.fn>;
  readonly body?: unknown;
  readonly invalidBody?: unknown;
}

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

const CASES: Case[] = [
  {
    name: "interrupt",
    load: () => import("./interrupt/route"),
    call: client.interruptMission,
  },
  { name: "stop", load: () => import("./stop/route"), call: client.stopMission },
  { name: "resume", load: () => import("./resume/route"), call: client.resumeMission },
  {
    name: "say",
    load: () => import("./say/route"),
    call: client.sayToMission,
    body: { text: "carry on" },
    invalidBody: { text: "   " },
  },
  {
    name: "mode",
    load: () => import("./mode/route"),
    call: client.setMissionMode,
    body: { mode: "acceptEdits" },
    invalidBody: { mode: "bypassPermissions" },
  },
  {
    name: "answer",
    load: () => import("./answer/route"),
    call: client.answerPrompt,
    body: { promptId: "p1", decision: "allow" },
    invalidBody: { promptId: "p1", decision: "maybe" },
  },
];

function request(body: unknown) {
  return new Request("http://localhost/api/missions/m1/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getMission.mockReturnValue({ id: "m1", title: "t" });
  for (const call of Object.values(client)) call.mockResolvedValue({ ok: true });
});

describe.each(CASES)("POST .../$name", (route) => {
  async function post(body = route.body) {
    const { POST } = await route.load();
    return POST(request(body), { params: Promise.resolve({ id: "m1" }) });
  }

  it("forwards to the session host", async () => {
    expect((await post()).status).toBe(200);
    expect(route.call).toHaveBeenCalled();
  });

  it("is a 404 for a mission that does not exist", async () => {
    getMission.mockReturnValue(undefined);

    expect((await post()).status).toBe(404);
    expect(route.call).not.toHaveBeenCalled();
  });

  // Restarting the session host is a supported state, not a fault of the
  // request, and the console tells the operator which of the two it was.
  it("says when the session host is unreachable", async () => {
    route.call.mockResolvedValue({ ok: false, reason: "unreachable" });

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "agentd_unreachable" });
  });

  it("passes a refusal through with its own status", async () => {
    route.call.mockResolvedValue({
      ok: false,
      reason: "rejected",
      status: 409,
      body: { error: "session_not_running" },
    });

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "session_not_running" });
  });
});

describe.each(CASES.filter((route) => route.invalidBody !== undefined))(
  "POST .../$name with a body it will not accept",
  (route) => {
    it("refuses it before forwarding", async () => {
      const { POST } = await route.load();

      const response = await POST(request(route.invalidBody), {
        params: Promise.resolve({ id: "m1" }),
      });

      expect(response.status).toBe(400);
      expect(route.call).not.toHaveBeenCalled();
    });
  },
);
