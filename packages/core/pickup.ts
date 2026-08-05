import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { getConfig } from "./env";
import { resolveCredentials } from "./settings";
import { asanaCache, MISSION_SOURCE, type Mission } from "./schema";
import {
  addGithubIssueLabel,
  commentOnGithubIssue,
  removeGithubIssueLabel,
} from "./pickup-github";
import {
  addAsanaTaskTag,
  commentOnAsanaTask,
  removeAsanaTaskTag,
} from "./pickup-asana";

/**
 * The console's own word for "an agent is on this" — the same one whether it
 * lands as a GitHub label or an Asana tag, so the two integrations read as one
 * convention rather than two.
 */
export const PICKED_UP_LABEL = "agent-picked-up";
const PICKED_UP_DESCRIPTION = "An agent-console mission is working on this.";

function credentials(db: Db) {
  const config = getConfig();
  return resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });
}

// sourceRef for a github mission is "<repo>#<number>", built alongside the
// "Send Claude" button on the issues page.
function issueNumberFrom(sourceRef: string): number | undefined {
  const match = /#(\d+)$/.exec(sourceRef);
  return match ? Number(match[1]) : undefined;
}

// The sync cache is the only place the task's workspace is recorded; a
// mission itself only keeps the task's gid.
function workspaceGidFor(db: Db, taskGid: string): string | undefined {
  const cached = db.select().from(asanaCache).where(eq(asanaCache.gid, taskGid)).get();
  return cached?.workspaceGid ?? undefined;
}

function pickupComment(mission: Mission): string {
  return `Picked up by an agent-console mission: "${mission.title}".`;
}

async function markGithub(db: Db, mission: Mission): Promise<void> {
  const number = mission.sourceRef ? issueNumberFrom(mission.sourceRef) : undefined;
  const { githubToken } = credentials(db);
  if (!githubToken || !mission.repo || number === undefined) return;

  const ref = { token: githubToken, repo: mission.repo, issueNumber: number };
  await addGithubIssueLabel(ref, PICKED_UP_LABEL, PICKED_UP_DESCRIPTION);
  await commentOnGithubIssue(ref, pickupComment(mission));
}

async function releaseGithub(db: Db, mission: Mission): Promise<void> {
  const number = mission.sourceRef ? issueNumberFrom(mission.sourceRef) : undefined;
  const { githubToken } = credentials(db);
  if (!githubToken || !mission.repo || number === undefined) return;

  await removeGithubIssueLabel(
    { token: githubToken, repo: mission.repo, issueNumber: number },
    PICKED_UP_LABEL,
  );
}

async function markAsana(db: Db, mission: Mission): Promise<void> {
  const { asanaToken } = credentials(db);
  const taskGid = mission.sourceRef;
  const workspaceGid = taskGid ? workspaceGidFor(db, taskGid) : undefined;
  if (!asanaToken || !taskGid || !workspaceGid) return;

  const ref = { token: asanaToken, taskGid, workspaceGid };
  await addAsanaTaskTag(ref, PICKED_UP_LABEL);
  await commentOnAsanaTask(ref, pickupComment(mission));
}

async function releaseAsana(db: Db, mission: Mission): Promise<void> {
  const { asanaToken } = credentials(db);
  const taskGid = mission.sourceRef;
  const workspaceGid = taskGid ? workspaceGidFor(db, taskGid) : undefined;
  if (!asanaToken || !taskGid || !workspaceGid) return;

  await removeAsanaTaskTag(
    { token: asanaToken, taskGid, workspaceGid },
    PICKED_UP_LABEL,
  );
}

/**
 * Tells the source an agent has taken this: a label plus a comment, on
 * whichever integration the mission came from. A free-standing mission has no
 * source to tell.
 *
 * Best-effort, like a push notification: GitHub or Asana being unreachable, or
 * a token that no longer has write access, must not fail the launch it is
 * only decorating.
 */
export async function markSourcePickedUp(db: Db, mission: Mission): Promise<void> {
  try {
    if (mission.source === MISSION_SOURCE.GITHUB) await markGithub(db, mission);
    else if (mission.source === MISSION_SOURCE.ASANA) await markAsana(db, mission);
  } catch {
    // See the doc comment above: never lets a decoration fail the mission.
  }
}

/**
 * The other half of markSourcePickedUp: taken off once a mission is no longer
 * the one working on it, whether it finished, failed, or was stopped.
 */
export async function releaseSourcePickup(db: Db, mission: Mission): Promise<void> {
  try {
    if (mission.source === MISSION_SOURCE.GITHUB) await releaseGithub(db, mission);
    else if (mission.source === MISSION_SOURCE.ASANA) await releaseAsana(db, mission);
  } catch {
    // See markSourcePickedUp: never lets a decoration fail the mission.
  }
}
