import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openPullRequest, publishWork, pushBranch } from "./publish";

let root: string;
let origin: string;
let work: string;

const BRANCH = "agent/does-a-thing";

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "publish-"));
  origin = path.join(root, "origin.git");
  work = path.join(root, "work");
  mkdirSync(work, { recursive: true });

  git(root, "init", "--bare", "--quiet", "--initial-branch", "main", origin);
  git(root, "clone", "--quiet", origin, work);
  git(work, "config", "user.email", "t@example.com");
  git(work, "config", "user.name", "Test");
  writeFileSync(path.join(work, "README.md"), "hello\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "first");
  git(work, "push", "--quiet", "origin", "main");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function commitOnBranch() {
  git(work, "checkout", "--quiet", "-b", BRANCH);
  writeFileSync(path.join(work, "feature.txt"), "work\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "feat: a thing");
}

function remoteBranches(): string[] {
  return execFileSync("git", [
    "--git-dir",
    origin,
    "branch",
    "--format=%(refname:short)",
  ])
    .toString()
    .split("\n")
    .filter(Boolean);
}

describe("pushBranch", () => {
  it("puts the agent's commits on the remote", async () => {
    commitOnBranch();

    const outcome = await pushBranch({
      worktreePath: work,
      branch: BRANCH,
      base: "main",
    });

    expect(outcome).toMatchObject({ pushed: true });
    expect(remoteBranches()).toContain(BRANCH);
  });

  // Six missions finished with a branch that had nothing on it, and a button
  // that opened an empty pull request would be worse than one that says so.
  it("refuses a branch with nothing on it", async () => {
    git(work, "checkout", "--quiet", "-b", BRANCH);

    const outcome = await pushBranch({
      worktreePath: work,
      branch: BRANCH,
      base: "main",
    });

    expect(outcome).toMatchObject({ pushed: false, reason: "nothing to push" });
    expect(remoteBranches()).not.toContain(BRANCH);
  });

  it("is safe to run twice", async () => {
    commitOnBranch();
    await pushBranch({ worktreePath: work, branch: BRANCH, base: "main" });

    await expect(
      pushBranch({ worktreePath: work, branch: BRANCH, base: "main" }),
    ).resolves.toMatchObject({ pushed: true });
  });
});

describe("openPullRequest", () => {
  const input = {
    token: "t",
    repo: "acme/widget",
    head: BRANCH,
    base: "main",
    title: "feat: a thing",
    body: "why",
  };

  it("returns the pull request it opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { html_url: "https://github.com/acme/widget/pull/7" },
          {
            status: 201,
          },
        ),
      ),
    );

    await expect(openPullRequest(input)).resolves.toBe(
      "https://github.com/acme/widget/pull/7",
    );
  });

  // Pressing the button twice, or pressing it after the agent already opened
  // one, is the ordinary case — not an error worth showing.
  it("returns the existing one when the branch already has a pull request", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("pulls?")
        ? Response.json([{ html_url: "https://github.com/acme/widget/pull/3" }])
        : Response.json({ message: "A pull request already exists" }, { status: 422 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(openPullRequest(input)).resolves.toBe(
      "https://github.com/acme/widget/pull/3",
    );
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Bad credentials" }, { status: 401 })),
    );

    await expect(openPullRequest(input)).rejects.toThrow(/401/);
  });
});

describe("publishWork", () => {
  const extras = { repo: "acme/widget", token: "t", missionTitle: "Fix the thing" };

  it("says so rather than opening an empty pull request", async () => {
    git(work, "checkout", "--quiet", "-b", BRANCH);

    await expect(
      publishWork({ worktreePath: work, branch: BRANCH, base: "main", ...extras }),
    ).resolves.toMatchObject({ ok: false, reason: "nothing to push" });
  });

  // commitlint governs what merges, and a mission is named after the problem it
  // came from — which is not a conventional commit subject.
  it("titles the pull request with the commit, not the mission", async () => {
    commitOnBranch();
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      Response.json(
        { html_url: "https://github.com/acme/widget/pull/9" },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishWork({
      worktreePath: work,
      branch: BRANCH,
      base: "main",
      ...extras,
    });

    expect(result).toMatchObject({
      ok: true,
      url: "https://github.com/acme/widget/pull/9",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.title).toBe("feat: a thing");
    expect(body.body).toContain("Fix the thing");
  });
});
