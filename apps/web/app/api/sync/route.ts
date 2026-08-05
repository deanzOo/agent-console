import { NextResponse } from "next/server";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { resolveCredentials } from "@agent-console/core/settings";
import { syncAsana, syncIssues, syncRepos } from "@agent-console/core/sync";

export const dynamic = "force-dynamic";

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
      // Every repository with open issues, not the first ten of them. The cap
      // that used to live here truncated silently, so a sync that reached a
      // fraction of the repositories reported plain success.
      const synced = await syncRepos(db, resolved.githubToken);
      result.issues = await syncIssues(db, resolved.githubToken, synced);
      result.repos = synced.all.length;
      result.reposWithIssues = synced.withOpenIssues.length;
    } catch (error) {
      result.githubError = error instanceof Error ? error.message : String(error);
    }
  }

  if (features.asana && resolved.asanaToken) {
    try {
      const asana = await syncAsana(db, resolved.asanaToken);
      result.tasks = asana.tasks;
      result.workspaces = asana.workspaces;
    } catch (error) {
      result.asanaError = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json(result);
}
