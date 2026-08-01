import { beforeEach, describe, expect, it, vi } from "vitest";

const getMission = vi.fn();
const discardWorkspace = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/env", () => ({
  getConfig: () => ({ workspaceRoot: "/workspace", githubToken: "t" }),
}));
vi.mock("@agent-console/core/missions", () => ({ getMission }));
vi.mock("@agent-console/core/workspace", () => ({ discardWorkspace }));

const { DELETE } = await import("./route");

function remove() {
  return DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
    params: Promise.resolve({ id: "m1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getMission.mockReturnValue({ id: "m1", worktreePath: "/workspace/wt/m1" });
  discardWorkspace.mockResolvedValue({ ok: true });
});

describe("DELETE /api/missions/[id]/workspace", () => {
  it("discards the working tree", async () => {
    expect((await remove()).status).toBe(200);
    expect(discardWorkspace).toHaveBeenCalled();
  });

  it("is a 404 for a mission that does not exist", async () => {
    getMission.mockReturnValue(undefined);

    expect((await remove()).status).toBe(404);
    expect(discardWorkspace).not.toHaveBeenCalled();
  });

  // Deleting the tree under a running agent would take the work away
  // mid-sentence, so the refusal is the point rather than an edge case.
  it("passes on a refusal to discard a live mission", async () => {
    discardWorkspace.mockResolvedValue({ ok: false, reason: "mission_is_live" });

    const response = await remove();

    expect(response.status).toBeGreaterThanOrEqual(400);
    await expect(response.json()).resolves.toMatchObject({ error: "mission_is_live" });
  });
});
