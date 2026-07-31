import type { Db } from "./db";
import { removeWorktree, type GitEnvironment } from "./git";
import { appendEvent, recordWorkspace } from "./missions";
import type { Mission } from "./schema";
import { MISSION_STATUS } from "./schema";

/** A mission still in one of these is using its worktree right now. */
const LIVE_STATUSES: readonly string[] = [
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
];

export type DiscardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "still_running" | "nothing_to_discard" };

/**
 * Throws away a finished mission's working tree.
 *
 * Deliberately destructive and deliberately narrow: anything uncommitted in
 * that tree is gone. It refuses while the mission is live, because removing the
 * directory out from under a running agent is a different and worse failure
 * than being told no.
 */
export async function discardWorkspace(
  db: Db,
  env: GitEnvironment,
  mission: Mission,
): Promise<DiscardResult> {
  if (LIVE_STATUSES.includes(mission.status)) {
    return { ok: false, reason: "still_running" };
  }
  if (!mission.repo || !mission.worktreePath) {
    return { ok: false, reason: "nothing_to_discard" };
  }

  await removeWorktree(env, mission.repo, mission.id);

  // The path is cleared so the UI stops offering to discard what is gone, and
  // the transcript records it: a tree vanishing with no account of why is worse
  // than the disk it freed.
  recordWorkspace(db, mission.id, { branch: mission.branch ?? "", worktreePath: "" });
  appendEvent(db, mission.id, "mission.workspace", {
    action: "discarded",
    worktreePath: mission.worktreePath,
  });

  return { ok: true };
}
