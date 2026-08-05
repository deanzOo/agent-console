import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addGithubIssueLabel,
  commentOnGithubIssue,
  removeGithubIssueLabel,
} from "./pickup-github";

const ref = { token: "t", repo: "acme/widget", issueNumber: 7 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("addGithubIssueLabel", () => {
  it("creates the label first when the repository has never used it", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).endsWith("/labels/agent-picked-up")) {
          return new Response(null, { status: 404 });
        }
        return new Response(null, { status: 201 });
      }),
    );

    await addGithubIssueLabel(ref, "agent-picked-up", "An agent is on this.");

    expect(calls).toEqual([
      "GET https://api.github.com/repos/acme/widget/labels/agent-picked-up",
      "POST https://api.github.com/repos/acme/widget/labels",
      "POST https://api.github.com/repos/acme/widget/issues/7/labels",
    ]);
  });

  it("does not try to recreate a label that already exists", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).endsWith("/labels/agent-picked-up")) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 200 });
      }),
    );

    await addGithubIssueLabel(ref, "agent-picked-up", "An agent is on this.");

    expect(calls).toEqual([
      "GET https://api.github.com/repos/acme/widget/labels/agent-picked-up",
      "POST https://api.github.com/repos/acme/widget/issues/7/labels",
    ]);
  });

  it("tolerates the label being created by a racing mission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).endsWith("/labels/agent-picked-up")) {
          return new Response(null, { status: 404 });
        }
        // The repository-wide creation endpoint, not the per-issue one below —
        // both end in "/labels", so this has to check the fuller path.
        if (String(url).endsWith("/repos/acme/widget/labels")) {
          return new Response(null, { status: 422 });
        }
        return new Response(null, { status: 200 });
      }),
    );

    await expect(
      addGithubIssueLabel(ref, "agent-picked-up", "An agent is on this."),
    ).resolves.toBeUndefined();
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).endsWith("/labels/agent-picked-up")) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 403 });
      }),
    );

    await expect(
      addGithubIssueLabel(ref, "agent-picked-up", "An agent is on this."),
    ).rejects.toThrow(/403/);
  });
});

describe("removeGithubIssueLabel", () => {
  it("deletes the label from the issue", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await removeGithubIssueLabel(ref, "agent-picked-up");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widget/issues/7/labels/agent-picked-up",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  // The label may already be off, or the issue could have been deleted or
  // renumbered underneath the mission — neither is worth failing over.
  it("is quiet about a label that is already gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(
      removeGithubIssueLabel(ref, "agent-picked-up"),
    ).resolves.toBeUndefined();
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(removeGithubIssueLabel(ref, "agent-picked-up")).rejects.toThrow(/401/);
  });
});

describe("commentOnGithubIssue", () => {
  it("posts the body to the issue's comments", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await commentOnGithubIssue(ref, "Picked up by a mission.");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/widget/issues/7/comments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "Picked up by a mission." }),
      }),
    );
  });

  it("reports a refusal rather than swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 410 })),
    );

    await expect(commentOnGithubIssue(ref, "x")).rejects.toThrow(/410/);
  });
});
