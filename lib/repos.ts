import path from "node:path";

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const MISSION_ID_PATTERN = /^[A-Za-z0-9-]+$/;
export const MAX_BRANCH_LENGTH = 60;

export function barePath(workspaceRoot: string, fullName: string): string {
  if (!REPO_PATTERN.test(fullName) || fullName.includes("..")) {
    throw new Error(`Invalid repository name: ${fullName}`);
  }
  return path.join(workspaceRoot, "repos", `${fullName.replace("/", "__")}.git`);
}

export function worktreePath(workspaceRoot: string, missionId: string): string {
  if (!MISSION_ID_PATTERN.test(missionId)) {
    throw new Error(`Invalid mission id: ${missionId}`);
  }
  return path.join(workspaceRoot, "wt", missionId);
}

export function branchNameFor(title: string, missionId: string): string {
  const suffix = missionId.slice(0, 8);
  const room = MAX_BRANCH_LENGTH - "agent/".length - suffix.length - 1;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(room, 0))
    .replace(/-+$/g, "");

  return slug ? `agent/${slug}-${suffix}` : `agent/${suffix}`;
}
