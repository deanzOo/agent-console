import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Db } from "../db";
import { appendEvent, setStatus } from "../missions";
import { MISSION_STATUS, missions, pendingPrompts } from "../schema";

/** A mission in one of these believes a session is holding it. */
const LIVE_STATUSES = [
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
] as const;

/**
 * Ends missions whose session died with the process.
 *
 * Sessions are in-memory, so a restart of the session host leaves the database
 * claiming missions are running and their approvals still open. The console
 * then offers prompts nobody can answer — answering returns session_not_running
 * — and the operator is left with a mission that cannot be advanced or dismissed.
 *
 * Called at startup, when the registry is empty by definition: anything still
 * marked live is a leftover.
 */
function closeOpenPrompts(db: Db, missionId: string): void {
  // Answered rather than deleted: the prompt happened, and the transcript is
  // the record of what the agent asked for.
  db.update(pendingPrompts)
    .set({ answeredAt: new Date().toISOString() })
    .where(
      and(eq(pendingPrompts.missionId, missionId), isNull(pendingPrompts.answeredAt)),
    )
    .run();
}

export function reconcileOrphans(db: Db): number {
  const orphans = db
    .select({ id: missions.id })
    .from(missions)
    .where(and(inArray(missions.status, LIVE_STATUSES), isNull(missions.archivedAt)))
    .all();

  for (const { id } of orphans) {
    closeOpenPrompts(db, id);
    setStatus(db, id, MISSION_STATUS.STOPPED);
    appendEvent(db, id, "mission.status", {
      status: MISSION_STATUS.STOPPED,
      error: "The session host restarted, so this mission's session was lost.",
    });
  }

  // A mission can also finish with an approval still outstanding, and that
  // prompt is just as undeliverable — the console offered it and answering
  // returned session_not_running.
  const finished = db
    .select({ id: missions.id })
    .from(missions)
    .where(
      and(notInArray(missions.status, [...LIVE_STATUSES]), isNull(missions.archivedAt)),
    )
    .all();

  for (const { id } of finished) closeOpenPrompts(db, id);

  return orphans.length;
}
