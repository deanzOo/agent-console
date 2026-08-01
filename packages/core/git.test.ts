import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWorktree,
  defaultBranch,
  pruneWorktrees,
  refreshClone,
  removeWorktree,
} from "./git";
import { barePath, worktreePath } from "./repos";

// A real repository on disk rather than a mock: the bug this covers was that a
// bare clone has no origin/* refs, which only a real clone can tell you.
let root: string;
let origin: string;
let env: { workspaceRoot: string };

const FULL_NAME = "acme/widget";
const MISSION = "11111111-2222-3333-4444-555555555555";

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
  root = mkdtempSync(path.join(tmpdir(), "git-"));
  origin = path.join(root, "origin");
  mkdirSync(origin, { recursive: true });

  git(origin, "init", "--quiet", "--initial-branch", "main");
  git(origin, "config", "user.email", "t@example.com");
  git(origin, "config", "user.name", "Test");
  writeFileSync(path.join(origin, "README.md"), "hello\n");
  git(origin, "add", ".");
  git(origin, "commit", "--quiet", "-m", "first");

  env = { workspaceRoot: path.join(root, "workspace") };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function clone() {
  // ensureBareClone builds the URL from the repo name, so the test points the
  // bare path at the local origin directly and clones it the same way.
  const target = barePath(env.workspaceRoot, FULL_NAME);
  mkdirSync(path.dirname(target), { recursive: true });
  execFileSync("git", ["clone", "--bare", "--quiet", origin, target], {
    stdio: "pipe",
  });
  return target;
}

describe("a bare clone", () => {
  it("reports the branch its HEAD points at", async () => {
    const bare = await clone();
    expect(await defaultBranch(bare)).toBe("main");
  });

  // The bug: `git clone --bare` copies branches into refs/heads and creates no
  // remote-tracking refs at all, so "origin/main" names nothing.
  it("has the branch locally and no origin/* ref", async () => {
    const bare = await clone();

    expect(() =>
      execFileSync("git", ["--git-dir", bare, "rev-parse", "main"], { stdio: "pipe" }),
    ).not.toThrow();

    expect(() =>
      execFileSync("git", ["--git-dir", bare, "rev-parse", "origin/main"], {
        stdio: "pipe",
      }),
    ).toThrow();
  });
});

describe("createWorktree", () => {
  it("creates a working tree on a new branch from the base", async () => {
    const bare = await clone();
    const base = await defaultBranch(bare);

    const created = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: MISSION,
      branch: "agent/test-1",
      base,
    });

    expect(created).toBe(worktreePath(env.workspaceRoot, MISSION));
    expect(existsSync(path.join(created, "README.md"))).toBe(true);

    const branch = execFileSync("git", ["-C", created, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    expect(branch).toBe("agent/test-1");
  });

  it("fails loudly when the base does not name anything", async () => {
    const bare = await clone();
    expect(bare).toContain("acme__widget.git");

    await expect(
      createWorktree(env, {
        fullName: FULL_NAME,
        missionId: MISSION,
        branch: "agent/test-2",
        base: "origin/main",
      }),
      // git words this differently across versions: "invalid reference" on
      // some, "not a valid object name" on others. Both mean the ref is absent.
    ).rejects.toThrow(/invalid reference|not a valid object name/);
  });

  it("gives two missions on one repository separate trees", async () => {
    const bare = await clone();
    const base = await defaultBranch(bare);
    const second = "99999999-8888-7777-6666-555555555555";

    const a = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: MISSION,
      branch: "agent/a",
      base,
    });
    const b = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: second,
      branch: "agent/b",
      base,
    });

    expect(a).not.toBe(b);
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });
});

describe("removeWorktree", () => {
  it("removes the tree and leaves the repository intact", async () => {
    const bare = await clone();
    const base = await defaultBranch(bare);
    const created = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: MISSION,
      branch: "agent/test-3",
      base,
    });

    await removeWorktree(env, FULL_NAME, MISSION);

    expect(existsSync(created)).toBe(false);
    expect(existsSync(bare)).toBe(true);
  });

  it("prunes trees whose directory vanished", async () => {
    const bare = await clone();
    const base = await defaultBranch(bare);
    const created = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: MISSION,
      branch: "agent/test-4",
      base,
    });

    rmSync(created, { recursive: true, force: true });
    await pruneWorktrees(env, FULL_NAME);

    const listed = execFileSync("git", ["--git-dir", bare, "worktree", "list"], {
      encoding: "utf8",
    });
    expect(listed).not.toContain(MISSION);
  });
});

// The bug this covers cost eleven commits of drift: `git clone --bare` sets no
// fetch refspec at all, so the fetch in ensureBareClone updated nothing and the
// clone's branches stayed frozen at the moment it was created. Every mission
// branched from that snapshot and every pull request opened against a base it
// had never seen.
describe("keeping the clone current", () => {
  function upstreamCommit(message: string) {
    writeFileSync(path.join(origin, `${message}.txt`), "more\n");
    git(origin, "add", ".");
    git(origin, "commit", "--quiet", "-m", message);
    return execFileSync("git", ["-C", origin, "rev-parse", "HEAD"]).toString().trim();
  }

  it("picks up commits pushed after the clone was made", async () => {
    const bare = await clone();
    const tip = upstreamCommit("second");

    await refreshClone(bare);

    const seen = execFileSync("git", ["--git-dir", bare, "rev-parse", "origin/main"])
      .toString()
      .trim();
    expect(seen).toBe(tip);
  });

  it("branches a new mission from the commit that is on the remote now", async () => {
    const bare = await clone();
    const tip = upstreamCommit("third");
    await refreshClone(bare);

    const tree = await createWorktree(env, {
      fullName: FULL_NAME,
      missionId: MISSION,
      branch: "agent/work",
      base: "origin/main",
    });

    const head = execFileSync("git", ["-C", tree, "rev-parse", "HEAD"])
      .toString()
      .trim();
    expect(head).toBe(tip);
  });
});
