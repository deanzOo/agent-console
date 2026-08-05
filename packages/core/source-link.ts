import type { Db } from "./db";
import { getCachedTask } from "./tasks";
import { MISSION_SOURCE, type Mission } from "./schema";

export interface SourceLink {
  readonly label: string;
  readonly url: string | undefined;
}

// sourceRef for a github mission is "<repo>#<number>", built alongside the
// "Send Claude" button on the issues page.
function issueNumberFrom(sourceRef: string): number | undefined {
  const match = /#(\d+)$/.exec(sourceRef);
  return match ? Number(match[1]) : undefined;
}

/**
 * Where a mission's issue or task actually lives, for the mission page to
 * name and link back to.
 *
 * GitHub's URL is fully predictable from the repo and issue number the
 * mission already stored — it needs no lookup, and stays right even after the
 * issue closes and drops out of the cache. Asana's does not: the permalink is
 * only ever known from the sync cache, and a task that has since completed or
 * was never synced again leaves the mission with a name but nowhere to link.
 */
export function sourceLinkFor(db: Db, mission: Mission): SourceLink | undefined {
  if (!mission.sourceRef) return undefined;

  if (mission.source === MISSION_SOURCE.GITHUB) {
    const number = issueNumberFrom(mission.sourceRef);
    if (!mission.repo || number === undefined) return undefined;
    return {
      label: `${mission.repo}#${number}`,
      url: `https://github.com/${mission.repo}/issues/${number}`,
    };
  }

  if (mission.source === MISSION_SOURCE.ASANA) {
    const task = getCachedTask(db, mission.sourceRef);
    return { label: task?.name ?? "Asana task", url: task?.permalink ?? undefined };
  }

  return undefined;
}
