import { and, eq, isNull, notInArray } from "drizzle-orm";
import type { Db } from "../db";
import { missions, pendingPrompts } from "../schema";
import { LIVE_STATUSES } from "./recover";

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
export function closeOpenPrompts(db: Db, missionId: string): void {
  // Answered rather than deleted: the prompt happened, and the transcript is
  // the record of what the agent asked for.
  db.update(pendingPrompts)
    .set({ answeredAt: new Date().toISOString() })
    .where(
      and(eq(pendingPrompts.missionId, missionId), isNull(pendingPrompts.answeredAt)),
    )
    .run();
}

/**
 * Closes prompts that can never be answered.
 *
 * A mission that finished with an approval outstanding keeps it, and the console
 * offers a decision that answers with session_not_running. Live missions are
 * left alone: recovery decides whether they come back, and closes their prompts
 * itself when they do not.
 */
export function reconcileOrphans(db: Db): number {
  const finished = db
    .select({ id: missions.id })
    .from(missions)
    .where(
      and(notInArray(missions.status, [...LIVE_STATUSES]), isNull(missions.archivedAt)),
    )
    .all();

  for (const { id } of finished) closeOpenPrompts(db, id);

  return finished.length;
}
