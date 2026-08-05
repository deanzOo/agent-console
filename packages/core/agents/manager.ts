import { mkdirSync } from "node:fs";
import { getConfig } from "../env";
import { getDatabase, type Db } from "../db";
import {
  appendEvent,
  getMission,
  missionPrompt,
  recordWorkspace,
  setStatus,
  type MissionSource,
} from "../missions";
import { MISSION_STATUS, type Mission } from "../schema";
import { branchNameFor } from "../repos";
import { createWorktree, defaultBranch, ensureBareClone } from "../git";
import { closeOpenPrompts } from "./orphans";
import { concurrencyLimit, hasCapacity, nextQueued } from "./queue";
import { planRecovery } from "./recover";
import { createSdkDriver } from "./driver";
import { MissionSession } from "./session";
import { createMission } from "../missions";
import { describeBundle, readBundle } from "../okf";
import { resolveCredentials } from "../settings";

/**
 * The GitHub token as the operator actually configured it.
 *
 * `/setup` writes it to the settings table, so reading the environment alone
 * finds nothing on a deployment configured through the wizard — which is why
 * clones were anonymous and every agent reached the push with no credential.
 */
function githubToken(db: Db): string | undefined {
  const config = getConfig();
  return resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  }).githubToken;
}

export interface LaunchInput {
  readonly title: string;
  readonly prompt: string;
  readonly source: MissionSource;
  readonly sourceRef?: string | undefined;
  readonly repo?: string | undefined;
  readonly base?: string | undefined;
}

// Sessions are live generators and unresolved promises, so they cannot be
// shared between processes. This registry is why the app runs single-process.
const sessions = new Map<string, MissionSession>();

export function getSession(missionId: string): MissionSession | undefined {
  return sessions.get(missionId);
}

export function runningCount(): number {
  return sessions.size;
}

/**
 * The mission's own instructions, with what the operator has written down about
 * this deployment in front of them.
 *
 * A list of what exists and where, never the contents: an agent that needs the
 * deployment's conventions reads them, and one that does not spends nothing.
 */
function withKnowledge(prompt: string, bundlePath: string | undefined): string {
  if (!bundlePath) return prompt;

  const described = describeBundle(readBundle(bundlePath), bundlePath);
  return described ? `${described}\n\n---\n\n${prompt}` : prompt;
}

/**
 * Starts a mission that already exists, whether it was just accepted or has
 * been waiting in the queue.
 *
 * The working tree is created here rather than at acceptance: a queue twenty
 * deep would otherwise be twenty checkouts on a small disk, most of which are
 * not being worked in.
 */
async function startMission(missionId: string, input: LaunchInput): Promise<void> {
  const db = getDatabase();
  const config = getConfig();
  const mission = { id: missionId };

  try {
    const cwd = (await prepareWorkspace(db, mission.id, input)) ?? config.workspaceRoot;
    // A missing cwd makes the spawn fail with ENOENT, which the Agent SDK
    // reports as the binary being unlaunchable — an error naming libc and the
    // dynamic loader, nowhere near the actual cause. Same reason db.ts creates
    // the database's directory rather than trusting it to be there.
    mkdirSync(cwd, { recursive: true });

    const session = new MissionSession(db, mission.id);
    sessions.set(mission.id, session);
    releaseSlotWhenFinished(mission.id, session);

    session.start(createSdkDriver(githubToken(db)), {
      missionId: mission.id,
      prompt: withKnowledge(input.prompt, config.knowledgeBundlePath),
      cwd,
      resume: getMission(db, mission.id)?.sessionId ?? undefined,
    });
  } catch (error) {
    // The session is registered before it starts, so a throw from start()
    // would otherwise leave a dead one in the map — counted by runningCount()
    // and handed out by getSession() for a mission that never ran.
    sessions.delete(mission.id);
    setStatus(db, mission.id, "failed");
    // Without this the transcript is silent about why: the mission shows as
    // failed and the only account of the reason went back in an HTTP response
    // nobody kept.
    appendEvent(db, mission.id, "mission.status", {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const TERMINAL = [
  MISSION_STATUS.DONE,
  MISSION_STATUS.FAILED,
  MISSION_STATUS.STOPPED,
] as const;

/**
 * Frees the slot when a mission ends, and gives it to whoever is waiting.
 *
 * Listening to the transcript rather than the session's own lifetime: every way
 * a mission can end already records its status there, so there is one place to
 * watch instead of one per ending.
 */
function releaseSlotWhenFinished(missionId: string, session: MissionSession): void {
  const stop = session.subscribe((event) => {
    if (event.type !== "mission.status") return;
    const status = Object(event.payload).status;
    if (!TERMINAL.some((terminal) => terminal === status)) return;

    stop();
    sessions.delete(missionId);
    void drainQueue().catch(() => undefined);
  });
}

/**
 * The input a queued mission was accepted with.
 *
 * Held in the row rather than in memory, so a queue survives the restart that
 * the whole recovery mechanism exists for.
 */
function queuedInput(mission: Mission): LaunchInput {
  return {
    title: mission.title,
    prompt: missionPrompt(getDatabase(), mission.id) ?? "",
    source: mission.source,
    sourceRef: mission.sourceRef ?? undefined,
    repo: mission.repo ?? undefined,
  };
}

/**
 * Starts whatever the box now has room for.
 *
 * Called when a mission ends and when the host boots, which are the only two
 * moments capacity appears.
 */
export async function drainQueue(): Promise<number> {
  const db = getDatabase();
  const limit = concurrencyLimit(db);
  let started = 0;

  while (hasCapacity(runningCount(), limit)) {
    const waiting = nextQueued(db);
    if (!waiting) break;

    // Out of the queue before it starts: a failure to start must not leave it
    // queued forever, and startMission records the failure itself.
    setStatus(db, waiting.id, MISSION_STATUS.STARTING);
    try {
      await startMission(waiting.id, queuedInput(waiting));
      started += 1;
    } catch {
      // Already recorded on the mission; the next one still deserves its turn.
    }
  }

  return started;
}

export async function launchMission(input: LaunchInput): Promise<string> {
  const db = getDatabase();

  const mission = createMission(db, {
    title: input.title,
    source: input.source,
    prompt: input.prompt,
    sourceRef: input.sourceRef,
    repo: input.repo,
  });

  // Accepted either way. What changes is whether it starts now or waits, and
  // the operator sees which from the mission's own status.
  if (!hasCapacity(runningCount(), concurrencyLimit(db))) {
    setStatus(db, mission.id, MISSION_STATUS.QUEUED);
    appendEvent(db, mission.id, "mission.status", {
      status: MISSION_STATUS.QUEUED,
      note: "waiting for a free slot",
    });
    return mission.id;
  }

  await startMission(mission.id, input);
  return mission.id;
}

async function prepareWorkspace(
  db: Db,
  missionId: string,
  input: LaunchInput,
): Promise<string | undefined> {
  if (!input.repo) return undefined;

  const config = getConfig();
  const env = { workspaceRoot: config.workspaceRoot, token: githubToken(db) };

  const bare = await ensureBareClone(env, input.repo);
  const base = input.base ?? (await defaultBranch(bare));
  const branch = branchNameFor(input.title, missionId);

  const worktreePath = await createWorktree(env, {
    fullName: input.repo,
    missionId,
    branch,
    // The remote-tracking ref, not the plain branch name: the clone's own
    // refs/heads/* are whatever the remote held when it was first cloned and
    // never move, which is how eleven commits of drift reached a pull request.
    base: `origin/${base}`,
  });

  recordWorkspace(db, missionId, { branch, worktreePath });
  return worktreePath;
}

/**
 * Brings back missions whose session died with the process, and gives up on the
 * rest with a reason.
 *
 * Called at startup, where the registry is empty by definition: anything the
 * database still calls live is a leftover.
 */
export async function recoverMissions(): Promise<{ resumed: number; stopped: number }> {
  const db = getDatabase();
  const config = getConfig();
  let resumed = 0;
  let stopped = 0;

  for (const plan of planRecovery(db)) {
    const { mission } = plan;

    if (plan.action === "stop") {
      closeOpenPrompts(db, mission.id);
      setStatus(db, mission.id, MISSION_STATUS.STOPPED);
      appendEvent(db, mission.id, "mission.status", {
        status: MISSION_STATUS.STOPPED,
        error: `The session host restarted and this mission was not resumed: ${plan.reason}.`,
      });
      stopped += 1;
      continue;
    }

    // The approval it was parked on died with the process, so it is closed and
    // the agent asks again. Seeing the same request twice beats losing the work.
    closeOpenPrompts(db, mission.id);
    appendEvent(db, mission.id, "mission.resumed", { sessionId: mission.sessionId });

    const session = new MissionSession(db, mission.id);
    sessions.set(mission.id, session);
    releaseSlotWhenFinished(mission.id, session);
    session.start(createSdkDriver(githubToken(db)), {
      missionId: mission.id,
      prompt: "Continue where you left off.",
      cwd: mission.worktreePath || config.workspaceRoot,
      resume: mission.sessionId ?? undefined,
    });
    resumed += 1;
  }

  // A queue survives the restart too, and boot is one of the two moments
  // capacity appears. Resumed missions are counted first, so this only starts
  // what the box still has room for.
  const started = await drainQueue();

  return { resumed: resumed + started, stopped };
}

export async function stopMission(missionId: string): Promise<void> {
  const session = sessions.get(missionId);
  if (!session) return;
  sessions.delete(missionId);
  await session.stop();
  setStatus(getDatabase(), missionId, "stopped");
}
