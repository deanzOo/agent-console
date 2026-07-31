import { mkdirSync } from "node:fs";
import { getConfig } from "../env";
import { getDatabase } from "../db";
import { appendEvent, getMission, setStatus, type MissionSource } from "../missions";
import { branchNameFor } from "../repos";
import { createWorktree, defaultBranch, ensureBareClone } from "../git";
import { createSdkDriver } from "./driver";
import { MissionSession } from "./session";
import { createMission } from "../missions";

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

export async function launchMission(input: LaunchInput): Promise<string> {
  const db = getDatabase();
  const config = getConfig();

  const mission = createMission(db, {
    title: input.title,
    source: input.source,
    prompt: input.prompt,
    sourceRef: input.sourceRef,
    repo: input.repo,
  });

  try {
    const cwd = (await prepareWorkspace(mission.id, input)) ?? config.workspaceRoot;
    // A missing cwd makes the spawn fail with ENOENT, which the Agent SDK
    // reports as the binary being unlaunchable — an error naming libc and the
    // dynamic loader, nowhere near the actual cause. Same reason db.ts creates
    // the database's directory rather than trusting it to be there.
    mkdirSync(cwd, { recursive: true });

    const session = new MissionSession(db, mission.id);
    sessions.set(mission.id, session);

    session.start(createSdkDriver(), {
      missionId: mission.id,
      prompt: input.prompt,
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

  return mission.id;
}

async function prepareWorkspace(
  missionId: string,
  input: LaunchInput,
): Promise<string | undefined> {
  if (!input.repo) return undefined;

  const config = getConfig();
  const env = { workspaceRoot: config.workspaceRoot, token: config.githubToken };

  const bare = await ensureBareClone(env, input.repo);
  const base = input.base ?? (await defaultBranch(bare));

  return createWorktree(env, {
    fullName: input.repo,
    missionId,
    branch: branchNameFor(input.title, missionId),
    // A bare clone holds branches in refs/heads and creates no remote-tracking
    // refs, so the base is the branch name itself. "origin/main" names nothing
    // there, and every repo-backed mission died on it.
    base,
  });
}

export async function stopMission(missionId: string): Promise<void> {
  const session = sessions.get(missionId);
  if (!session) return;
  sessions.delete(missionId);
  await session.stop();
  setStatus(getDatabase(), missionId, "stopped");
}
