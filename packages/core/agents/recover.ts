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

/**
 * How many resume at once. Each replays context and costs tokens, so a boot
 * after a long outage should not silently spend a fortune.
 */
export const MAX_RESUMED_PER_BOOT = 5;

export type Recovery =
  | { readonly action: "resume"; readonly mission: Mission }
  | { readonly action: "stop"; readonly mission: Mission; readonly reason: string };

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
export function planRecovery(db: Db, exists = existsSync): Recovery[] {
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
    if (resuming >= MAX_RESUMED_PER_BOOT) {
      return { action: "stop", mission, reason: "too many missions to resume at once" };
    }

    resuming += 1;
    return { action: "resume", mission };
  });
}
