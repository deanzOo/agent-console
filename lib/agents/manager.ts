import { getConfig } from "@/config/env";
import { getDatabase } from "../db";
import { getMission, setStatus, type MissionSource } from "../missions";
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
    const cwd = await prepareWorkspace(mission.id, input);
    const session = new MissionSession(db, mission.id);
    sessions.set(mission.id, session);

    session.start(createSdkDriver(), {
      missionId: mission.id,
      prompt: input.prompt,
      cwd: cwd ?? config.workspaceRoot,
      resume: getMission(db, mission.id)?.sessionId ?? undefined,
    });
  } catch (error) {
    setStatus(db, mission.id, "failed");
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
    base: `origin/${base}`,
  });
}

export async function stopMission(missionId: string): Promise<void> {
  const session = sessions.get(missionId);
  if (!session) return;
  sessions.delete(missionId);
  await session.stop();
  setStatus(getDatabase(), missionId, "stopped");
}
