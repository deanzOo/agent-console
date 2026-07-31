import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import { issuesCache } from "@agent-console/core/schema";
import { resolveCredentials } from "@agent-console/core/settings";
import { StartFromSource } from "../start-from-source";

export const dynamic = "force-dynamic";

export default function IssuesPage() {
  const db = getDatabase();
  const config = getConfig();
  const resolved = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  // An unconfigured integration is absent, not broken.
  if (!getFeatures(resolved).github) notFound();

  const issues = db
    .select()
    .from(issuesCache)
    .orderBy(desc(issuesCache.updatedAt))
    .limit(100)
    .all();

  return (
    <main className="space-y-4">
      <h1 className="text-lg font-semibold">Open issues</h1>

      {issues.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing cached yet. Run a sync from the dashboard.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {issues.map((issue) => (
            <li key={`${issue.repo}#${issue.number}`} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{issue.title}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {issue.repo} #{issue.number}
                  </p>
                </div>
                <StartFromSource
                  source="github"
                  sourceRef={`${issue.repo}#${issue.number}`}
                  repo={issue.repo}
                  title={issue.title}
                  prompt={`Work on ${issue.repo} issue #${issue.number}: ${issue.title}\n\n${issue.url}\n\nRead the issue, make the change on a new branch, and open a pull request.`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
