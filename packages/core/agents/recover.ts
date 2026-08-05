import { existsSync } from "node:fs";
import { and, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { listEvents } from "../missions";
import { MISSION_STATUS, missions, type Mission } from "../schema";

/** A mission in one of these believes a session is holding it. */
export const LIVE_STATUSES = [
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
] as const;

/**
 * How many times a mission may be resumed before it is left stopped.
 *
 * If resuming is itself what kills the process, it will resume again on the
 * next boot, and again. The count comes from the transcript rather than a new
 * column: the events are already durable, and a counter that resets on restart
 * would not survive the case it exists for.
 */
export const MAX_RESUME_ATTEMPTS = 3;

export type Recovery =
  | { readonly action: "resume"; readonly mission: Mission }
  | { readonly action: "queue"; readonly mission: Mission }
  | { readonly action: "stop"; readonly mission: Mission; readonly reason: string };

export type ManualResume =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether an operator may bring a mission back by hand.
 *
 * Shares the session and working-tree checks `planRecovery` uses — a resume
 * with neither would fail in a way that reads as a bug rather than as what it
 * is. Deliberately absent is `MAX_RESUME_ATTEMPTS`: that counter exists to
 * stop a boot loop from resuming the same mission forever on its own, and an
 * operator asking for it once by hand is a different signal that must not be
 * blocked by it.
 *
 * Only a `stopped` mission qualifies. `failed` covers a different kind of
 * ending — the agent erroring out mid-run — and recovery never leaves a
 * mission there, so there is nothing for this to reason about.
 */
export function canResumeManually(mission: Mission, exists = existsSync): ManualResume {
  if (mission.status !== MISSION_STATUS.STOPPED) {
    return { ok: false, reason: "only a stopped mission can be resumed" };
  }
  if (!mission.sessionId) {
    return { ok: false, reason: "it never had a session to resume" };
  }
  if (mission.worktreePath && !exists(mission.worktreePath)) {
    return { ok: false, reason: "its working tree is gone" };
  }
  return { ok: true };
}

function resumeCount(db: Db, missionId: string): number {
  return listEvents(db, missionId, 0).filter(
    (event) => event.type === "mission.resumed",
  ).length;
}

/**
 * Decides what to do with missions whose session died with the process.
 *
 * Separated from the doing so the rules are testable without spawning an agent:
 * which missions come back, which are given up on, and why.
 */
/**
 * Decides what becomes of missions whose session died with the process.
 *
 * `capacity` is the concurrency cap, and it applies here for the same reason it
 * applies to a launch: a resumed mission is an agent like any other. Bringing
 * back more than the box was told to run is how a restart recreated the very
 * pile-up the cap exists to prevent.
 *
 * What does not fit is queued rather than stopped. The work is still there and a
 * slot will free; stopping it would throw away a worktree for want of a minute.
 */
export function planRecovery(
  db: Db,
  capacity: number,
  exists = existsSync,
): Recovery[] {
  const orphans = db
    .select()
    .from(missions)
    .where(and(inArray(missions.status, LIVE_STATUSES), isNull(missions.archivedAt)))
    .all();

  let resuming = 0;

  return orphans.map((mission): Recovery => {
    if (!mission.sessionId) {
      // It never got far enough to have a session to resume.
      return { action: "stop", mission, reason: "no session to resume" };
    }
    if (mission.worktreePath && !exists(mission.worktreePath)) {
      return { action: "stop", mission, reason: "its working tree is gone" };
    }
    if (resumeCount(db, mission.id) >= MAX_RESUME_ATTEMPTS) {
      return {
        action: "stop",
        mission,
        reason: `it has already been resumed ${MAX_RESUME_ATTEMPTS} times`,
      };
    }
    if (resuming >= capacity) return { action: "queue", mission };

    resuming += 1;
    return { action: "resume", mission };
  });
}
