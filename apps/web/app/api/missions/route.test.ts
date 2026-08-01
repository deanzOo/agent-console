import { beforeEach, describe, expect, it, vi } from "vitest";

const listMissions = vi.fn();
const countAwaitingInput = vi.fn();
const launchMission = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/missions", () => ({ listMissions, countAwaitingInput }));
vi.mock("@/lib/agentd", () => ({ launchMission }));

const { GET, POST } = await import("./route");

const LAUNCH = { title: "Fix the thing", prompt: "do it", source: "free" };

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/missions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMissions.mockReturnValue([{ id: "m1" }]);
  countAwaitingInput.mockReturnValue(2);
  launchMission.mockResolvedValue({ ok: true, value: { id: "m2" } });
});

describe("GET /api/missions", () => {
  // The badge is this count, so the list and the number beside it come from one
  // request and cannot disagree.
  it("answers with the list and how many are waiting", async () => {
    await expect(GET().json()).resolves.toEqual({
      missions: [{ id: "m1" }],
      awaitingInput: 2,
    });
  });
});

describe("POST /api/missions", () => {
  it("launches and answers 201 with the new mission", async () => {
    const response = await post(LAUNCH);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "m2" });
  });

  it("refuses a body it cannot read, and says which field", async () => {
    const response = await post({ prompt: "do it", source: "free" });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
    expect(JSON.stringify(body.issues)).toContain("title");
  });

  // The path derivation and `git clone` both see this, so a repository that is
  // not owner/repo is refused at the boundary rather than deeper in.
  it("refuses a repository name that is not owner/repo", async () => {
    expect((await post({ ...LAUNCH, repo: "../etc" })).status).toBe(400);
    expect(launchMission).not.toHaveBeenCalled();
  });

  it("says when the session host is unreachable", async () => {
    launchMission.mockResolvedValue({ ok: false, reason: "unreachable" });

    const response = await post(LAUNCH);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "agentd_unreachable" });
  });

  it("passes a refusal through with its own status", async () => {
    launchMission.mockResolvedValue({
      ok: false,
      reason: "rejected",
      status: 409,
      body: { error: "too_many_missions" },
    });

    expect((await post(LAUNCH)).status).toBe(409);
  });
});
