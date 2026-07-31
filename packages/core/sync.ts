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

export async function syncRepos(db: Db, token: string): Promise<string[]> {
  const payload = await githubJson(token, "/user/repos?per_page=100&sort=updated");
  const names: string[] = [];

  for (const entry of Array.isArray(payload) ? payload : []) {
    const fullName = Object(entry).full_name;
    const defaultBranch = Object(entry).default_branch;
    if (typeof fullName !== "string") continue;

    names.push(fullName);
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

  return names;
}

export async function syncAsana(db: Db, token: string): Promise<number> {
  const result = await callTool(asanaServer(token), "asana_list_workspaces", {});
  const workspaces = readToolJson(result);
  const first = Object(Object(workspaces).data ?? workspaces)[0];
  const workspaceGid = Object(first).gid;
  if (typeof workspaceGid !== "string") return 0;

  const tasksResult = await callTool(asanaServer(token), "asana_search_tasks", {
    workspace: workspaceGid,
    completed: false,
    limit: 50,
  });

  const tasks = parseAsanaTasks(readToolJson(tasksResult));

  db.transaction((tx) => {
    for (const task of tasks) {
      tx.insert(asanaCache)
        .values(task)
        .onConflictDoUpdate({ target: asanaCache.gid, set: task })
        .run();
    }
  });

  return tasks.length;
}

export async function gitVersion(): Promise<string> {
  const { stdout } = await run("git", ["--version"]);
  return stdout.trim();
}
