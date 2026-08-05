import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { MISSION_STATUS, missions, type Mission } from "../schema";
import { getSetting } from "../settings";

/**
 * How many missions run at once when the operator has not said.
 *
 * A mission is a whole Claude Code process, not a request. Two is what a
 * two-core box survives; more is what took one down. The operator raises it in
 * settings once they know their machine.
 */
export const DEFAULT_MAX_CONCURRENT = 2;

export function concurrencyLimit(db: Db): number {
  const configured = Number.parseInt(
    getSetting(db, "max_concurrent_missions") ?? "",
    10,
  );

  // A cap of zero would accept missions and start none of them, which is
  // indistinguishable from the app being broken.
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_CONCURRENT;
}

/**
 * Whether another mission may start.
 *
 * Takes the count rather than reading it: what counts as running is the live
 * session registry, which the database cannot see.
 */
export function hasCapacity(running: number, limit: number): boolean {
  return running < limit;
}

/** The queued mission that has waited longest, or the queue is a lottery. */
export function nextQueued(db: Db): Mission | undefined {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.status, MISSION_STATUS.QUEUED), isNull(missions.archivedAt)))
    .orderBy(asc(missions.createdAt), asc(missions.id))
    .limit(1)
    .get();
}
