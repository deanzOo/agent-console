import { notFound } from "next/navigation";
import { getConfig } from "@agent-console/core/env";
import { getFeatures } from "@agent-console/core/features";
import { getDatabase } from "@agent-console/core/db";
import {
  listIssueLabels,
  listIssueOrgs,
  listIssuePage,
  listIssueRepos,
} from "@agent-console/core/issues";
import { resolveCredentials } from "@agent-console/core/settings";
import { FilterBar } from "../filter-bar";
import { Pager } from "../pager";
import { StartFromSource } from "../start-from-source";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    org?: string;
    repo?: string;
    label?: string;
    from?: string;
  }>;
}) {
  const { q, org, repo, label, from } = await searchParams;
  const offset = Math.max(0, Number.parseInt(from ?? "", 10) || 0);
  const db = getDatabase();
  const config = getConfig();
  const resolved = resolveCredentials(db, {
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  // An unconfigured integration is absent, not broken.
  if (!getFeatures(resolved).github) notFound();

  const { issues, total } = listIssuePage(db, {
    org,
    repo,
    label,
    query: q,
    limit: PAGE_SIZE,
    offset,
  });
  // Each list is narrowed by the filters above it, so the choices on offer are
  // only ones that can actually match something.
  const orgs = listIssueOrgs(db);
  const repos = listIssueRepos(db, { org });
  const labels = listIssueLabels(db, { org, repo });

  return (
    <main className="space-y-4">
      <h1 className="text-lg font-semibold">Open issues</h1>

      <FilterBar
        placeholder="Search issues"
        selectors={[
          {
            name: "org",
            label: "All orgs",
            choices: orgs.map((name) => ({ value: name, label: name })),
          },
          {
            name: "repo",
            label: "All repositories",
            choices: repos.map((name) => ({
              value: name,
              label: name.split("/")[1] ?? name,
            })),
          },
          {
            name: "label",
            label: "All labels",
            choices: labels.map((name) => ({ value: name, label: name })),
          },
        ]}
      />

      {issues.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {q || org || repo || label
            ? "No issue matches that filter."
            : "Nothing cached yet. Run a sync from the dashboard."}
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

      {issues.length > 0 && (
        <Pager
          total={total}
          shown={issues.length}
          offset={offset}
          pageSize={PAGE_SIZE}
        />
      )}
    </main>
  );
}
