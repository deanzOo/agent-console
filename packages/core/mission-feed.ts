import { asc, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { missions } from "./schema";

/**
 * How often the live feed looks for a change.
 *
 * Missions are run by agentd and read by the web app, two processes sharing one
 * database file, so the database is the only place both agree on. Polling it is
 * what makes the feed right whoever wrote the change — including recovery on
 * boot, which no in-process notification would reach.
 */
export const STATUS_POLL_MS = 2_000;

/** Changes exactly when the mission list on screen is out of date. */
export function statusSignature(db: Db): string {
  return db
    .select({ id: missions.id, status: missions.status })
    .from(missions)
    .where(isNull(missions.archivedAt))
    .orderBy(asc(missions.id))
    .all()
    .map((mission) => `${mission.id}:${mission.status}`)
    .join(",");
}
