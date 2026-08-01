import { beforeEach, describe, expect, it, vi } from "vitest";

const getMission = vi.fn();
const appendEvent = vi.fn();
const publishWork = vi.fn();
const resolveCredentials = vi.fn();
const defaultBranch = vi.fn(async () => "main");

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/env", () => ({
  getConfig: () => ({ workspaceRoot: "/workspace", githubToken: undefined }),
}));
vi.mock("@agent-console/core/git", () => ({ defaultBranch }));
vi.mock("@agent-console/core/missions", () => ({ getMission, appendEvent }));
vi.mock("@agent-console/core/publish", () => ({ publishWork }));
vi.mock("@agent-console/core/repos", () => ({ barePath: () => "/workspace/bare.git" }));
vi.mock("@agent-console/core/settings", () => ({ resolveCredentials }));

const { POST } = await import("./route");

const READY = {
  id: "m1",
  title: "Fix the thing",
  repo: "acme/widget",
  branch: "agent/fix",
  worktreePath: "/workspace/wt/m1",
};

function post(id = "m1") {
  return POST(
    new Request("http://localhost/api/missions/m1/publish", { method: "POST" }),
    {
      params: Promise.resolve({ id }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMission.mockReturnValue(READY);
  resolveCredentials.mockReturnValue({ githubToken: "t" });
  publishWork.mockResolvedValue({
    ok: true,
    url: "https://github.com/acme/widget/pull/1",
  });
});

describe("POST /api/missions/[id]/publish", () => {
  it("answers with the pull request it opened", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://github.com/acme/widget/pull/1",
    });
  });

  // The transcript is where a mission accounts for itself, and this is the last
  // thing that happens to one.
  it("records the pull request in the transcript", async () => {
    await post();

    expect(appendEvent).toHaveBeenCalledWith({}, "m1", "mission.published", {
      url: "https://github.com/acme/widget/pull/1",
    });
  });

  it("compares against the branch the work is destined for", async () => {
    await post();

    expect(publishWork).toHaveBeenCalledWith(expect.objectContaining({ base: "main" }));
  });

  it("is a 404 for a mission that does not exist", async () => {
    getMission.mockReturnValue(undefined);

    expect((await post("nope")).status).toBe(404);
  });

  // A free-text mission has no repository, so there is nothing to publish.
  it("refuses a mission with no branch", async () => {
    getMission.mockReturnValue({ ...READY, branch: null });

    const response = await post();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "no_branch" });
  });

  // A disabled integration is a supported state, and its route answers 404
  // rather than throwing from an absent client.
  it("is absent when GitHub is not configured", async () => {
    resolveCredentials.mockReturnValue({ githubToken: undefined });

    expect((await post()).status).toBe(404);
  });

  it("passes on why publishing was refused", async () => {
    publishWork.mockResolvedValue({ ok: false, reason: "nothing to push" });

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "nothing to push" });
    expect(appendEvent).not.toHaveBeenCalled();
  });
});
