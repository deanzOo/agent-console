import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import { createWorktree, defaultBranch } from "./git";
import {
  createMission,
  getMission,
  listEvents,
  recordWorkspace,
  setStatus,
} from "./missions";
import { barePath } from "./repos";
import { MISSION_STATUS, type MISSION_STATUSES } from "./schema";
import { discardWorkspace } from "./workspace";

let root: string;
let db: Db;
let env: { workspaceRoot: string };

const FULL_NAME = "acme/widget";

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "ws-"));
  db = openDatabase(path.join(root, "data.db"), path.join(process.cwd(), "drizzle"));
  env = { workspaceRoot: path.join(root, "workspace") };

  const origin = path.join(root, "origin");
  mkdirSync(origin, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, stdio: "pipe" });
  git("init", "--quiet", "--initial-branch", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  writeFileSync(path.join(origin, "README.md"), "hi\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "first");

  const bare = barePath(env.workspaceRoot, FULL_NAME);
  mkdirSync(path.dirname(bare), { recursive: true });
  execFileSync("git", ["clone", "--bare", "--quiet", origin, bare], { stdio: "pipe" });
});

afterEach(() => {
  db.$client.close();
  rmSync(root, { recursive: true, force: true });
});

async function missionWithTree(
  status: (typeof MISSION_STATUSES)[number] = MISSION_STATUS.DONE,
) {
  const mission = createMission(db, {
    title: "Work",
    source: "github",
    prompt: "p",
    repo: FULL_NAME,
  });
  const bare = barePath(env.workspaceRoot, FULL_NAME);
  const worktreePath = await createWorktree(env, {
    fullName: FULL_NAME,
    missionId: mission.id,
    branch: "agent/work",
    base: await defaultBranch(bare),
  });
  recordWorkspace(db, mission.id, { branch: "agent/work", worktreePath });
  setStatus(db, mission.id, status);
  return { id: mission.id, worktreePath };
}

describe("discardWorkspace", () => {
  it("removes the tree of a finished mission", async () => {
    const { id, worktreePath } = await missionWithTree();
    expect(existsSync(worktreePath)).toBe(true);

    const result = await discardWorkspace(db, env, getMission(db, id)!);

    expect(result).toEqual({ ok: true });
    expect(existsSync(worktreePath)).toBe(false);
  });

  it("clears the recorded path, so it is not offered again", async () => {
    const { id } = await missionWithTree();
    await discardWorkspace(db, env, getMission(db, id)!);
    expect(getMission(db, id)?.worktreePath).toBe("");
  });

  it("records that it happened", async () => {
    const { id, worktreePath } = await missionWithTree();
    await discardWorkspace(db, env, getMission(db, id)!);

    const discarded = listEvents(db, id, 0).find((e) => e.type === "mission.workspace");

    expect(discarded).toBeDefined();
    expect(JSON.stringify(discarded?.payload)).toContain(worktreePath);
  });

  // Removing the directory out from under a running agent is a worse failure
  // than being told no.
  it.each([
    MISSION_STATUS.STARTING,
    MISSION_STATUS.RUNNING,
    MISSION_STATUS.AWAITING_INPUT,
  ])("refuses while the mission is %s", async (status) => {
    const { id, worktreePath } = await missionWithTree(status);

    const result = await discardWorkspace(db, env, getMission(db, id)!);

    expect(result).toEqual({ ok: false, reason: "still_running" });
    expect(existsSync(worktreePath)).toBe(true);
  });

  it("says there is nothing to discard for a mission with no tree", async () => {
    const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    const result = await discardWorkspace(db, env, getMission(db, mission.id)!);

    expect(result).toEqual({ ok: false, reason: "nothing_to_discard" });
  });

  it("leaves the mission and its transcript in place", async () => {
    const { id } = await missionWithTree();
    await discardWorkspace(db, env, getMission(db, id)!);
    expect(getMission(db, id)).toBeDefined();
  });
});
