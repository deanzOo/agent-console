import { NextResponse } from "next/server";
import { getDatabase } from "@agent-console/core/db";
import { getConfig } from "@agent-console/core/env";
import { defaultBranch } from "@agent-console/core/git";
import { appendEvent, getMission } from "@agent-console/core/missions";
import { publishWork } from "@agent-console/core/publish";
import { barePath } from "@agent-console/core/repos";
import { resolveCredentials } from "@agent-console/core/settings";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = getDatabase();
  const mission = getMission(db, id);

  if (!mission) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!mission.repo || !mission.branch || !mission.worktreePath) {
    return NextResponse.json({ error: "no_branch" }, { status: 400 });
  }

  const config = getConfig();
  const { githubToken } = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });
  if (!githubToken) {
    return NextResponse.json({ error: "github_not_configured" }, { status: 404 });
  }

  const result = await publishWork({
    worktreePath: mission.worktreePath,
    branch: mission.branch,
    base: await defaultBranch(barePath(config.workspaceRoot, mission.repo)),
    repo: mission.repo,
    token: githubToken,
    missionTitle: mission.title,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  // The transcript is where a mission accounts for itself, and opening the pull
  // request is the last thing that happens to one.
  appendEvent(db, id, "mission.published", { url: result.url });
  return NextResponse.json({ url: result.url });
}
