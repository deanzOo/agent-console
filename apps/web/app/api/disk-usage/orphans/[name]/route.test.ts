import { beforeEach, describe, expect, it, vi } from "vitest";

const discardOrphanTree = vi.fn();

vi.mock("@agent-console/core/env", () => ({
  getConfig: () => ({ workspaceRoot: "/workspace" }),
}));
vi.mock("@agent-console/core/disk-usage", () => ({ discardOrphanTree }));

const { DELETE } = await import("./route");

function remove(name: string) {
  return DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
    params: Promise.resolve({ name }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  discardOrphanTree.mockResolvedValue({ ok: true });
});

describe("DELETE /api/disk-usage/orphans/[name]", () => {
  it("discards the orphan tree", async () => {
    const response = await remove("stray-id");

    expect(response.status).toBe(200);
    expect(discardOrphanTree).toHaveBeenCalledWith("/workspace", "stray-id");
  });

  it("passes on a refusal to discard an invalid name", async () => {
    discardOrphanTree.mockResolvedValue({ ok: false, reason: "invalid_name" });

    const response = await remove("..");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_name" });
  });
});
