import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db";
import { listMissionsWithWorktree, type MissionStatus } from "./missions";

export interface MissionUsage {
  readonly missionId: string;
  readonly title: string;
  readonly status: MissionStatus;
  readonly bytes: number;
}

export interface OrphanTree {
  /** The directory's name under `wt/`, not a full path — nothing outside that
   * directory is ever named here. */
  readonly name: string;
  readonly bytes: number;
}

export interface MissingWorktree {
  readonly missionId: string;
  readonly title: string;
  readonly status: MissionStatus;
  readonly worktreePath: string;
}

export interface DiskUsageReport {
  readonly reposBytes: number;
  readonly worktreesBytes: number;
  readonly totalBytes: number;
  /** Largest first, so the expensive ones are the first thing seen. */
  readonly missions: readonly MissionUsage[];
  readonly orphanTrees: readonly OrphanTree[];
  readonly missingWorktrees: readonly MissingWorktree[];
}

function isMissing(error: unknown): boolean {
  return Object(error).code === "ENOENT";
}

// Symlinks are skipped rather than followed: a link elsewhere on disk must not
// inflate what a mission's tree is reported to cost, or let the walk leave the
// directory it was asked to measure.
async function directorySize(target: string): Promise<number> {
  const entries = await readdir(target, { withFileTypes: true }).catch((error) => {
    if (isMissing(error)) return [];
    throw error;
  });

  let total = 0;
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      total += (await stat(full)).size;
    }
  }
  return total;
}

async function listDirectoryNames(target: string): Promise<Set<string>> {
  const entries = await readdir(target, { withFileTypes: true }).catch((error) => {
    if (isMissing(error)) return [];
    throw error;
  });
  return new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
}

/**
 * What `WORKSPACE_ROOT` actually costs on disk, computed by walking it. There
 * is no cache: this app already asks the operator to press a button for
 * GitHub/Asana sync rather than polling on a timer, and a `du`-on-request fits
 * that same shape without a second cache-invalidation problem to get wrong.
 */
export async function getDiskUsage(
  db: Db,
  workspaceRoot: string,
): Promise<DiskUsageReport> {
  const reposBytes = await directorySize(path.join(workspaceRoot, "repos"));
  const wtRoot = path.join(workspaceRoot, "wt");
  const wtDirNames = await listDirectoryNames(wtRoot);

  const accounted = new Set<string>();
  const missions: MissionUsage[] = [];
  const missingWorktrees: MissingWorktree[] = [];

  for (const mission of listMissionsWithWorktree(db)) {
    const name = path.basename(mission.worktreePath);
    accounted.add(name);

    if (!wtDirNames.has(name)) {
      missingWorktrees.push({
        missionId: mission.id,
        title: mission.title,
        status: mission.status,
        worktreePath: mission.worktreePath,
      });
      continue;
    }

    const bytes = await directorySize(path.join(wtRoot, name));
    missions.push({
      missionId: mission.id,
      title: mission.title,
      status: mission.status,
      bytes,
    });
  }

  const orphanTrees: OrphanTree[] = [];
  for (const name of wtDirNames) {
    if (accounted.has(name)) continue;
    const bytes = await directorySize(path.join(wtRoot, name));
    orphanTrees.push({ name, bytes });
  }

  missions.sort((a, b) => b.bytes - a.bytes);
  orphanTrees.sort((a, b) => b.bytes - a.bytes);

  const worktreesBytes =
    missions.reduce((sum, mission) => sum + mission.bytes, 0) +
    orphanTrees.reduce((sum, tree) => sum + tree.bytes, 0);

  return {
    reposBytes,
    worktreesBytes,
    totalBytes: reposBytes + worktreesBytes,
    missions,
    orphanTrees,
    missingWorktrees,
  };
}

const ORPHAN_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type DiscardOrphanResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: "invalid_name" };

/**
 * Removes a tree under `wt/` with no mission row behind it — `discardWorkspace`
 * needs a mission to check status against, which an orphan by definition does
 * not have.
 *
 * The name is checked against a plain allowlist rather than resolved and
 * range-checked against `workspaceRoot`: "no slashes, no dot segments" is
 * easier to get right than a path comparison, and forecloses traversal
 * outright instead of trying to detect it after the fact.
 */
export async function discardOrphanTree(
  workspaceRoot: string,
  name: string,
): Promise<DiscardOrphanResult> {
  if (!ORPHAN_NAME_PATTERN.test(name) || name === "." || name === "..") {
    return { ok: false, reason: "invalid_name" };
  }

  await rm(path.join(workspaceRoot, "wt", name), { recursive: true, force: true });
  return { ok: true };
}
