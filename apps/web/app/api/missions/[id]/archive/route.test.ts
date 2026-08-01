import { beforeEach, describe, expect, it, vi } from "vitest";

const getMission = vi.fn();
const archiveMission = vi.fn();
const restoreMission = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/missions", () => ({
  getMission,
  archiveMission,
  restoreMission,
}));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "m1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMission.mockReturnValue({ id: "m1" });
});

describe("POST /api/missions/[id]/archive", () => {
  it("archives a mission", async () => {
    expect((await post({ archived: true })).status).toBe(200);
    expect(archiveMission).toHaveBeenCalledWith({}, "m1");
  });

  // The same route both ways: archiving is a view decision, and an operator who
  // hid a mission by accident needs it back.
  it("restores one", async () => {
    await post({ archived: false });

    expect(restoreMission).toHaveBeenCalledWith({}, "m1");
    expect(archiveMission).not.toHaveBeenCalled();
  });

  it("is a 404 for a mission that does not exist", async () => {
    getMission.mockReturnValue(undefined);

    expect((await post({ archived: true })).status).toBe(404);
    expect(archiveMission).not.toHaveBeenCalled();
  });

  it("refuses a body without the flag", async () => {
    expect((await post({})).status).toBe(400);
    expect(archiveMission).not.toHaveBeenCalled();
  });
});
