import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { barePath, worktreePath } from "./repos";

const run = promisify(execFile);

export interface GitEnvironment {
  readonly workspaceRoot: string;
  readonly token?: string | undefined;
}

function cloneUrl(fullName: string, token: string | undefined): string {
  // The token rides in the URL only for the clone/fetch call; it is never
  // written into the repository config.
  return token
    ? `https://x-access-token:${token}@github.com/${fullName}.git`
    : `https://github.com/${fullName}.git`;
}

// `git clone --bare` configures no fetch refspec, so a plain `git fetch origin`
// updates FETCH_HEAD and nothing else: the clone's branches stay frozen at the
// moment it was created. Fetching into remote-tracking refs also keeps the
// fetch clear of refs/heads/*, which git refuses to move while a mission's
// worktree has that branch checked out.
const FETCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*";

/** Brings an existing clone up to date with the remote. */
export async function refreshClone(bare: string): Promise<void> {
  await run("git", ["--git-dir", bare, "config", "remote.origin.fetch", FETCH_REFSPEC]);
  await run("git", ["--git-dir", bare, "fetch", "--prune", "origin"]);
}

export async function ensureBareClone(
  env: GitEnvironment,
  fullName: string,
): Promise<string> {
  const target = barePath(env.workspaceRoot, fullName);
  mkdirSync(path.dirname(target), { recursive: true });

  try {
    await run("git", ["--git-dir", target, "rev-parse", "--git-dir"]);
  } catch {
    await run("git", ["clone", "--bare", cloneUrl(fullName, env.token), target]);
  }

  await refreshClone(target);
  return target;
}

export async function defaultBranch(bare: string): Promise<string> {
  const { stdout } = await run("git", [
    "--git-dir",
    bare,
    "symbolic-ref",
    "--short",
    "HEAD",
  ]);
  return stdout.trim();
}

export interface CreateWorktreeInput {
  readonly fullName: string;
  readonly missionId: string;
  readonly branch: string;
  readonly base: string;
}

export async function createWorktree(
  env: GitEnvironment,
  input: CreateWorktreeInput,
): Promise<string> {
  const bare = barePath(env.workspaceRoot, input.fullName);
  const target = worktreePath(env.workspaceRoot, input.missionId);
  mkdirSync(path.dirname(target), { recursive: true });

  await run("git", [
    "--git-dir",
    bare,
    "worktree",
    "add",
    "-b",
    input.branch,
    target,
    input.base,
  ]);
  return target;
}

export async function removeWorktree(
  env: GitEnvironment,
  fullName: string,
  missionId: string,
): Promise<void> {
  const bare = barePath(env.workspaceRoot, fullName);
  const target = worktreePath(env.workspaceRoot, missionId);
  await run("git", ["--git-dir", bare, "worktree", "remove", "--force", target]);
}

/** Clears worktrees left behind by a mission that died badly. */
export async function pruneWorktrees(
  env: GitEnvironment,
  fullName: string,
): Promise<void> {
  await run("git", [
    "--git-dir",
    barePath(env.workspaceRoot, fullName),
    "worktree",
    "prune",
  ]);
}
