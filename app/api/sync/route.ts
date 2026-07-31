import { NextResponse } from "next/server";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { repos } from "@agent-console/core/schema";
import { resolveCredentials } from "@agent-console/core/settings";
import { syncAsana, syncIssues, syncRepos } from "@agent-console/core/sync";

export const dynamic = "force-dynamic";

const MAX_REPOS_PER_SYNC = 10;

export async function POST() {
  const db = getDatabase();
  const config = getConfig();
  const resolved = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });
  const features = getFeatures(resolved);

  const result: Record<string, number | string> = {};

  // Each integration is reported independently: one being down must not hide
  // the other's results.
  if (features.github && resolved.githubToken) {
    try {
      await syncRepos(db, resolved.githubToken);
      const tracked = db.select({ fullName: repos.fullName }).from(repos).all();
      result.issues = await syncIssues(
        db,
        resolved.githubToken,
        tracked.slice(0, MAX_REPOS_PER_SYNC).map((row) => row.fullName),
      );
    } catch (error) {
      result.githubError = error instanceof Error ? error.message : String(error);
    }
  }

  if (features.asana && resolved.asanaToken) {
    try {
      result.tasks = await syncAsana(db, resolved.asanaToken);
    } catch (error) {
      result.asanaError = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json(result);
}
