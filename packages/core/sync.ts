import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "./db";
import { asanaCache, issuesCache, repos } from "./schema";
import { callTool, type ServerSpec } from "./mcp/client";
import { parseAsanaTasks, parseGithubIssues, readToolJson } from "./mcp/parse";

const run = promisify(execFile);

function asanaServer(token: string): ServerSpec {
  return {
    name: "asana",
    command: "npx",
    args: ["-y", "@roychri/mcp-server-asana"],
    env: { ASANA_ACCESS_TOKEN: token },
  };
}

// GitHub goes through the REST API rather than an MCP server: the token is
// already required for cloning, and `fetch` is fewer moving parts than a child
// process for what is a plain list call.
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

export async function syncIssues(
  db: Db,
  token: string,
  repoNames: string[],
): Promise<number> {
  let total = 0;

  for (const repo of repoNames) {
    const payload = await githubJson(
      token,
      `/repos/${repo}/issues?state=open&per_page=50`,
    );
    const issues = parseGithubIssues(repo, payload);

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
    });
    total += issues.length;
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

function workspaceGids(payload: unknown): string[] {
  const listed: unknown = Object(payload).data ?? payload;
  if (!Array.isArray(listed)) return [];

  return listed
    .map((entry) => Object(entry).gid)
    .filter((gid): gid is string => typeof gid === "string");
}

export async function syncAsana(db: Db, token: string): Promise<AsanaSync> {
  const listed = await callTool(asanaServer(token), "asana_list_workspaces", {});
  // Every workspace, not the first one. An account with its tasks in the second
  // got zero results and a report of success.
  const gids = workspaceGids(readToolJson(listed));

  let total = 0;
  for (const workspace of gids) {
    const found = await callTool(asanaServer(token), "asana_search_tasks", {
      workspace,
      completed: false,
      limit: ASANA_TASK_LIMIT,
    });
    const tasks = parseAsanaTasks(readToolJson(found));

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

  return { tasks: total, workspaces: gids.length };
}

export async function gitVersion(): Promise<string> {
  const { stdout } = await run("git", ["--version"]);
  return stdout.trim();
}
