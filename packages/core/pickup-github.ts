export interface GithubIssueRef {
  readonly token: string;
  readonly repo: string;
  readonly issueNumber: number;
}

const NOT_FOUND = 404;
// GitHub's answer for a label that already exists — a racing mission or an
// operator who added it by hand, not something worth failing over.
const ALREADY_EXISTS = 422;
const LABEL_COLOR = "5319e7";

async function request(
  ref: Pick<GithubIssueRef, "token" | "repo">,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://api.github.com/repos/${ref.repo}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ref.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
}

async function ensureLabel(
  ref: Pick<GithubIssueRef, "token" | "repo">,
  label: string,
  description: string,
): Promise<void> {
  const existing = await request(ref, `/labels/${encodeURIComponent(label)}`);
  if (existing.ok) return;
  if (existing.status !== NOT_FOUND) {
    throw new Error(
      `GitHub responded ${existing.status} checking for the "${label}" label`,
    );
  }

  const created = await request(ref, "/labels", {
    method: "POST",
    body: JSON.stringify({ name: label, color: LABEL_COLOR, description }),
  });
  if (!created.ok && created.status !== ALREADY_EXISTS) {
    throw new Error(`GitHub responded ${created.status} creating the "${label}" label`);
  }
}

/** Adds the label, creating it on the repository first if nothing else ever has. */
export async function addGithubIssueLabel(
  ref: GithubIssueRef,
  label: string,
  description: string,
): Promise<void> {
  await ensureLabel(ref, label, description);

  const response = await request(ref, `/issues/${ref.issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [label] }),
  });
  if (!response.ok) {
    throw new Error(`GitHub responded ${response.status} adding the "${label}" label`);
  }
}

export async function removeGithubIssueLabel(
  ref: GithubIssueRef,
  label: string,
): Promise<void> {
  const response = await request(
    ref,
    `/issues/${ref.issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" },
  );
  // A label already off the issue, or an issue that is gone, both mean there
  // is nothing left to release.
  if (!response.ok && response.status !== NOT_FOUND) {
    throw new Error(
      `GitHub responded ${response.status} removing the "${label}" label`,
    );
  }
}

export async function commentOnGithubIssue(
  ref: GithubIssueRef,
  body: string,
): Promise<void> {
  const response = await request(ref, `/issues/${ref.issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`GitHub responded ${response.status} commenting on the issue`);
  }
}
