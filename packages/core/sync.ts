import { execFile } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { promisify } from "node:util";
import type { Db } from "./db";
import { asanaCache, issuesCache, repos } from "./schema";
import { parseAsanaTasks, parseGithubIssues } from "./mcp/parse";

const run = promisify(execFile);

// Both integrations go through plain REST rather than an MCP server. For GitHub
// the token is already required for cloning. For Asana the search endpoint the
// MCP server calls is premium-only — it answers "Search is only available to
// premium users", which arrived as an empty result and looked like success.
// This also removes an `npx` download at runtime inside the container.
// Supersedes the Asana half of ADR-0002.
async function githubJson(token: string, path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
  return response.json();
}

/**
 * Brings the issue cache in line with what GitHub reports as open.
 *
 * Upserting alone left every issue that was ever open in the console forever:
 * closing one on GitHub did nothing here, because nothing removed it. The cache
 * mirrors the remote rather than accumulating from it, so each repository's
 * rows are replaced by exactly what came back for it, and a repository that is
 * gone from `all` loses its rows entirely.
 */
export async function syncIssues(
  db: Db,
  token: string,
  repoSync: RepoSync,
): Promise<number> {
  const visible = new Set(repoSync.all);
  let total = 0;

  for (const repo of repoSync.all) {
    // GitHub already said which repositories have none, so asking the rest is a
    // request that can only come back empty — but their rows still have to go.
    const issues = repoSync.withOpenIssues.includes(repo)
      ? parseGithubIssues(
          repo,
          await githubJson(token, `/repos/${repo}/issues?state=open&per_page=50`),
        )
      : [];

    const open = new Set(issues.map((issue) => issue.number));

    db.transaction((tx) => {
      for (const issue of issues) {
        tx.insert(issuesCache)
          .values(issue)
          .onConflictDoUpdate({
            target: [issuesCache.repo, issuesCache.number],
            set: issue,
          })
          .run();
      }

      const stale = tx
        .select()
        .from(issuesCache)
        .where(eq(issuesCache.repo, repo))
        .all()
        .filter((row) => !open.has(row.number));

      for (const row of stale) {
        tx.delete(issuesCache)
          .where(and(eq(issuesCache.repo, repo), eq(issuesCache.number, row.number)))
          .run();
      }
    });
    total += issues.length;
  }

  // A repository the token can no longer see keeps nothing here either.
  for (const row of db.select().from(issuesCache).all()) {
    if (visible.has(row.repo)) continue;
    db.delete(issuesCache)
      .where(and(eq(issuesCache.repo, row.repo), eq(issuesCache.number, row.number)))
      .run();
  }

  return total;
}

export interface RepoSync {
  /** Every repository the token can see. */
  readonly all: string[];
  /**
   * Those with at least one open issue. GitHub already tells us the count when
   * it lists repositories, so asking the rest for their issues is a request per
   * repository that can only come back empty.
   */
  readonly withOpenIssues: string[];
}

export async function syncRepos(db: Db, token: string): Promise<RepoSync> {
  const payload = await githubJson(token, "/user/repos?per_page=100&sort=updated");
  const names: string[] = [];
  const withOpenIssues: string[] = [];

  for (const entry of Array.isArray(payload) ? payload : []) {
    const fullName = Object(entry).full_name;
    const defaultBranch = Object(entry).default_branch;
    if (typeof fullName !== "string") continue;

    names.push(fullName);
    // Absent rather than zero means GitHub did not say, so it is worth asking.
    const openIssues: unknown = Object(entry).open_issues_count;
    if (typeof openIssues !== "number" || openIssues > 0) withOpenIssues.push(fullName);
    db.insert(repos)
      .values({
        fullName,
        defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: repos.fullName,
        set: { defaultBranch, lastSyncedAt: new Date().toISOString() },
      })
      .run();
  }

  return { all: names, withOpenIssues };
}

export interface AsanaSync {
  readonly tasks: number;
  /** How many were actually searched, so "0 tasks" cannot hide "looked in one". */
  readonly workspaces: number;
}

const ASANA_TASK_LIMIT = 50;
// The list endpoint returns gid and name only unless asked for more.
const ASANA_TASK_FIELDS =
  "name,completed,due_on,permalink_url,modified_at,projects.name";

async function asanaJson(token: string, path: string): Promise<unknown> {
  const response = await fetch(`https://app.asana.com/api/1.0${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    // Asana explains itself properly; passing that through beats "0 tasks".
    const message = Object(Object(body).errors ?? [])[0];
    throw new Error(
      `Asana responded ${response.status}: ${Object(message).message ?? "unknown error"}`,
    );
  }
  return body;
}

interface AsanaWorkspace {
  readonly gid: string;
  readonly name: string | null;
}

function workspacesOf(payload: unknown): AsanaWorkspace[] {
  const listed: unknown = Object(payload).data ?? payload;
  if (!Array.isArray(listed)) return [];

  return listed
    .map((entry) => ({
      gid: Object(entry).gid,
      name: typeof Object(entry).name === "string" ? Object(entry).name : null,
    }))
    .filter(
      (workspace): workspace is AsanaWorkspace => typeof workspace.gid === "string",
    );
}

export async function syncAsana(db: Db, token: string): Promise<AsanaSync> {
  const listed = await asanaJson(token, "/workspaces");
  // Every workspace, not the first one. An account with its tasks in the second
  // got zero results and a report of success.
  const workspaces = workspacesOf(listed);

  let total = 0;
  for (const workspace of workspaces) {
    // Assigned to you and not yet completed. `completed_since=now` is Asana's
    // way of saying "incomplete only" on this endpoint.
    const found = await asanaJson(
      token,
      `/tasks?workspace=${workspace.gid}&assignee=me&completed_since=now` +
        `&limit=${ASANA_TASK_LIMIT}&opt_fields=${ASANA_TASK_FIELDS}`,
    );
    const tasks = parseAsanaTasks(found).map((task) => ({
      ...task,
      workspaceGid: workspace.gid,
      workspaceName: workspace.name,
    }));

    db.transaction((tx) => {
      for (const task of tasks) {
        tx.insert(asanaCache)
          .values(task)
          .onConflictDoUpdate({ target: asanaCache.gid, set: task })
          .run();
      }
    });
    total += tasks.length;
  }

  return { tasks: total, workspaces: workspaces.length };
}

export async function gitVersion(): Promise<string> {
  const { stdout } = await run("git", ["--version"]);
  return stdout.trim();
}
