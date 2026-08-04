import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import {
  createMission,
  recordWorkspace,
  setStatus,
  type MissionStatus,
} from "./missions";
import { MISSION_STATUS } from "./schema";
import { discardOrphanTree, getDiskUsage } from "./disk-usage";

let root: string;
let workspaceRoot: string;
let db: Db;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "disk-usage-"));
  workspaceRoot = path.join(root, "workspace");
  db = openDatabase(path.join(root, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(root, { recursive: true, force: true });
});

/** A tree with a single file of a known size, so the byte counts in assertions are exact. */
function writeTree(dir: string, fileBytes: number) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "content"), "x".repeat(fileBytes));
}

function missionWithTree(
  fileBytes: number,
  status: MissionStatus = MISSION_STATUS.DONE,
) {
  const mission = createMission(db, { title: "Work", source: "free", prompt: "p" });
  const worktreePath = path.join(workspaceRoot, "wt", mission.id);
  writeTree(worktreePath, fileBytes);
  recordWorkspace(db, mission.id, { branch: "agent/work", worktreePath });
  setStatus(db, mission.id, status);
  return mission.id;
}

describe("getDiskUsage", () => {
  it("reports zero for a workspace root that does not exist yet", async () => {
    const report = await getDiskUsage(db, workspaceRoot);

    expect(report).toEqual({
      reposBytes: 0,
      worktreesBytes: 0,
      totalBytes: 0,
      missions: [],
      orphanTrees: [],
      missingWorktrees: [],
    });
  });

  it("totals repos/ separately from wt/", async () => {
    writeTree(path.join(workspaceRoot, "repos", "acme__widget.git"), 100);
    missionWithTree(50);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.reposBytes).toBe(100);
    expect(report.worktreesBytes).toBe(50);
    expect(report.totalBytes).toBe(150);
  });

  it("reports each mission's tree size beside its status", async () => {
    const id = missionWithTree(200, MISSION_STATUS.RUNNING);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missions).toEqual([
      { missionId: id, title: "Work", status: MISSION_STATUS.RUNNING, bytes: 200 },
    ]);
  });

  it("orders missions from largest to smallest", async () => {
    const small = missionWithTree(10);
    const large = missionWithTree(1000);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missions.map((m) => m.missionId)).toEqual([large, small]);
  });

  it("lists a tree under wt/ with no mission row as an orphan", async () => {
    writeTree(path.join(workspaceRoot, "wt", "stray-id"), 30);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.orphanTrees).toEqual([{ name: "stray-id", bytes: 30 }]);
    expect(report.missions).toEqual([]);
    expect(report.worktreesBytes).toBe(30);
  });

  it("lists a mission whose recorded worktree is gone, separately from orphans", async () => {
    const mission = createMission(db, { title: "Gone", source: "free", prompt: "p" });
    const worktreePath = path.join(workspaceRoot, "wt", mission.id);
    recordWorkspace(db, mission.id, { branch: "agent/gone", worktreePath });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missingWorktrees).toEqual([
      {
        missionId: mission.id,
        title: "Gone",
        status: MISSION_STATUS.DONE,
        worktreePath,
      },
    ]);
    expect(report.missions).toEqual([]);
    expect(report.orphanTrees).toEqual([]);
  });

  it("does not double count a mission's tree as an orphan", async () => {
    const id = missionWithTree(40);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missions).toHaveLength(1);
    expect(report.orphanTrees).toEqual([]);
    expect(report.missions[0]?.missionId).toBe(id);
  });

  it("sums nested files within a tree", async () => {
    const mission = createMission(db, { title: "Nested", source: "free", prompt: "p" });
    const worktreePath = path.join(workspaceRoot, "wt", mission.id);
    mkdirSync(path.join(worktreePath, "sub"), { recursive: true });
    writeFileSync(path.join(worktreePath, "a"), "x".repeat(10));
    writeFileSync(path.join(worktreePath, "sub", "b"), "x".repeat(20));
    recordWorkspace(db, mission.id, { branch: "agent/nested", worktreePath });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missions[0]?.bytes).toBe(30);
  });

  // A symlink is not followed, so a link elsewhere on disk cannot inflate what
  // a mission's tree is reported to cost.
  it("does not follow a symlink inside a tree", async () => {
    const mission = createMission(db, { title: "Linked", source: "free", prompt: "p" });
    const worktreePath = path.join(workspaceRoot, "wt", mission.id);
    const elsewhere = path.join(root, "elsewhere");
    writeTree(elsewhere, 999);
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(path.join(worktreePath, "real"), "x".repeat(5));
    symlinkSync(elsewhere, path.join(worktreePath, "link"));
    recordWorkspace(db, mission.id, { branch: "agent/linked", worktreePath });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    const report = await getDiskUsage(db, workspaceRoot);

    expect(report.missions[0]?.bytes).toBe(5);
  });

  // Only ENOENT is treated as "nothing here yet". A directory that exists but
  // cannot be read is a real problem, and reporting it as zero bytes would
  // hide exactly the kind of misconfiguration an operator needs to see.
  it("raises rather than reporting zero for a tree it cannot read", async () => {
    const worktreePath = path.join(workspaceRoot, "wt", "locked");
    mkdirSync(worktreePath, { recursive: true });
    mkdirSync(path.join(worktreePath, "sub"));
    chmodSync(path.join(worktreePath, "sub"), 0);

    try {
      await expect(getDiskUsage(db, workspaceRoot)).rejects.toThrow();
    } finally {
      chmodSync(path.join(worktreePath, "sub"), 0o700);
    }
  });

  it("raises rather than reporting nothing when wt/ itself cannot be read", async () => {
    const wtRoot = path.join(workspaceRoot, "wt");
    mkdirSync(wtRoot, { recursive: true });
    chmodSync(wtRoot, 0);

    try {
      await expect(getDiskUsage(db, workspaceRoot)).rejects.toThrow();
    } finally {
      chmodSync(wtRoot, 0o700);
    }
  });
});

describe("discardOrphanTree", () => {
  it("removes the directory", async () => {
    const target = path.join(workspaceRoot, "wt", "stray-id");
    writeTree(target, 10);

    const result = await discardOrphanTree(workspaceRoot, "stray-id");

    expect(result).toEqual({ ok: true });
    expect(existsSync(target)).toBe(false);
  });

  it("succeeds even when nothing is there, like rm -rf", async () => {
    const result = await discardOrphanTree(workspaceRoot, "never-existed");
    expect(result).toEqual({ ok: true });
  });

  // The name is an allowlist rather than a resolved-path comparison, so a
  // traversal attempt is refused outright instead of relying on normalising it
  // away correctly.
  it.each(["..", ".", "../escape", "a/b", ""])(
    "refuses a name that could escape wt/: %s",
    async (name) => {
      const result = await discardOrphanTree(workspaceRoot, name);
      expect(result).toEqual({ ok: false, reason: "invalid_name" });
    },
  );

  it("leaves anything outside wt/ untouched by a traversal attempt", async () => {
    const secret = path.join(workspaceRoot, "repos", "keep.txt");
    writeTree(path.join(workspaceRoot, "repos"), 0);
    writeFileSync(secret, "keep me");

    await discardOrphanTree(workspaceRoot, "..%2Frepos%2Fkeep.txt");

    expect(existsSync(secret)).toBe(true);
  });
});
