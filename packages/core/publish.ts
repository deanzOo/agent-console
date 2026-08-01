import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { gitCredentialEnv } from "./agents/agent-env";

const run = promisify(execFile);

export type PushOutcome =
  { readonly pushed: true } | { readonly pushed: false; readonly reason: string };

export interface PushInput {
  readonly worktreePath: string;
  readonly branch: string;
  /**
   * The branch the work is destined for, by plain name.
   *
   * Compared against as `origin/<base>` and sent to GitHub as `<base>`: the
   * clone's own refs/heads/* are frozen at the moment it was cloned, so
   * counting commits against them credits the mission with work that was
   * already on the remote.
   */
  readonly base: string;
  readonly token?: string | undefined;
}

async function git(cwd: string, args: string[], token: string | undefined) {
  return run("git", args, {
    cwd,
    env: { ...process.env, ...gitCredentialEnv(token) },
  });
}

/** Whether the branch holds anything the remote does not already have. */
async function hasCommits(input: PushInput): Promise<boolean> {
  const { stdout } = await git(
    input.worktreePath,
    ["log", "--oneline", `origin/${input.base}..${input.branch}`],
    input.token,
  );
  return stdout.trim().length > 0;
}

/**
 * Puts a finished mission's work on the remote.
 *
 * The agent is given a credential of its own, but a mission that ended without
 * pushing — because it ran out of turns, was stopped, or predates the token
 * being passed at all — leaves its commits in a worktree with no way out.
 */
export async function pushBranch(input: PushInput): Promise<PushOutcome> {
  if (!(await hasCommits(input))) {
    return { pushed: false, reason: "nothing to push" };
  }

  await git(
    input.worktreePath,
    ["push", "--set-upstream", "origin", input.branch],
    input.token,
  );
  return { pushed: true };
}

export interface PullRequestInput {
  readonly token: string;
  readonly repo: string;
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
}

const createdSchema = z.object({ html_url: z.string() });
const listSchema = z.array(z.object({ html_url: z.string() }));

// 422 is what GitHub answers for a pull request that already exists, and for a
// head branch it cannot find. Only the first is recoverable, and the difference
// is whether listing finds one.
const ALREADY_EXISTS = 422;

async function githubJson(
  input: PullRequestInput,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${input.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
  });
  return { status: response.status, body: await response.json() };
}

export async function openPullRequest(input: PullRequestInput): Promise<string> {
  const created = await githubJson(input, `/repos/${input.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    }),
  });

  const opened = createdSchema.safeParse(created.body);
  if (opened.success) return opened.data.html_url;

  if (created.status === ALREADY_EXISTS) {
    const owner = input.repo.split("/")[0];
    const existing = await githubJson(
      input,
      `/repos/${input.repo}/pulls?head=${owner}:${input.head}&state=open`,
    );
    const found = listSchema.safeParse(existing.body);
    const first = found.success ? found.data[0] : undefined;
    if (first) return first.html_url;
  }

  throw new Error(`GitHub responded ${created.status}`);
}

export type PublishResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

async function commitSubjects(input: PushInput): Promise<string[]> {
  const { stdout } = await git(
    input.worktreePath,
    ["log", "--format=%s", `origin/${input.base}..${input.branch}`],
    input.token,
  );
  return stdout.split("\n").filter(Boolean);
}

/**
 * Pushes a mission's branch and opens the pull request for it.
 *
 * The title is the branch's last commit subject rather than the mission's:
 * commitlint governs what merges here, and a mission is named after the issue
 * it came from, which is a description of a problem rather than of a change.
 */
export async function publishWork(
  input: PushInput & { repo: string; token: string; missionTitle: string },
): Promise<PublishResult> {
  const subjects = await commitSubjects(input);
  if (subjects.length === 0) return { ok: false, reason: "nothing to push" };

  const pushed = await pushBranch(input);
  if (!pushed.pushed) return { ok: false, reason: pushed.reason };

  const url = await openPullRequest({
    token: input.token,
    repo: input.repo,
    head: input.branch,
    base: input.base,
    title: subjects[0] ?? input.missionTitle,
    body: `${input.missionTitle}\n\n${subjects.map((s) => `- ${s}`).join("\n")}`,
  });

  return { ok: true, url };
}
