import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCredentials = vi.fn();
const getFeatures = vi.fn();
const syncRepos = vi.fn();
const syncIssues = vi.fn();
const syncAsana = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@agent-console/core/env", () => ({ getConfig: () => ({}) }));
vi.mock("@agent-console/core/features", () => ({ getFeatures }));
vi.mock("@agent-console/core/settings", () => ({ resolveCredentials }));
vi.mock("@agent-console/core/sync", () => ({ syncRepos, syncIssues, syncAsana }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  resolveCredentials.mockReturnValue({ githubToken: "g", asanaToken: "a" });
  getFeatures.mockReturnValue({ github: true, asana: true });
  syncRepos.mockResolvedValue({ all: [1, 2, 3], withOpenIssues: ["acme/widget"] });
  syncIssues.mockResolvedValue(30);
  syncAsana.mockResolvedValue({ tasks: 9 });
});

describe("POST /api/sync", () => {
  it("reports what each integration brought back", async () => {
    await expect((await POST()).json()).resolves.toMatchObject({
      issues: 30,
      repos: 3,
      reposWithIssues: 1,
      tasks: 9,
    });
  });

  // Every repository, not only the ones with issues to fetch: a repository whose
  // last issue was closed still has rows here that have to go.
  it("hands the whole repository picture to the issue sync", async () => {
    await POST();

    expect(syncIssues).toHaveBeenCalledWith({}, "g", {
      all: [1, 2, 3],
      withOpenIssues: ["acme/widget"],
    });
  });

  // One integration being down must not hide the other's results, which is the
  // whole reason each is reported separately.
  it("still reports Asana when GitHub fails", async () => {
    syncRepos.mockRejectedValue(new Error("GitHub responded 401"));

    const body = await (await POST()).json();

    expect(body.githubError).toContain("401");
    expect(body.tasks).toBe(9);
  });

  it("skips an integration that is not configured", async () => {
    getFeatures.mockReturnValue({ github: false, asana: true });

    const body = await (await POST()).json();

    expect(syncRepos).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("issues");
    expect(body.tasks).toBe(9);
  });
});
