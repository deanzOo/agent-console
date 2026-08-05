import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { issuesCache, repos } from "./schema";
import { syncIssues, syncRepos } from "./sync";

let dir: string;
let db: Db;

function repo(fullName: string, openIssues: number) {
  return {
    full_name: fullName,
    default_branch: "main",
    open_issues_count: openIssues,
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sync-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("syncRepos", () => {
  it("records every repository the token can see", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json([
            repo("me/one", 0),
            repo("org/two", 3),
            repo("other/three", 1),
          ]),
        ),
    );

    const result = await syncRepos(db, "t");

    expect(result.all).toEqual(["me/one", "org/two", "other/three"]);
    expect(db.select().from(repos).all()).toHaveLength(3);
  });

  // One request per repository is wasted on a repository with no open issues,
  // and it was that waste which justified the cap that silently hid most of
  // them. Skipping the empty ones removes the reason for a cap at all.
  it("separates the repositories that actually have open issues", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json([
            repo("me/one", 0),
            repo("org/two", 3),
            repo("other/three", 1),
          ]),
        ),
    );

    const result = await syncRepos(db, "t");

    expect(result.withOpenIssues).toEqual(["org/two", "other/three"]);
  });

  it("treats a missing count as worth checking rather than skipping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json([{ full_name: "me/one" }])),
    );

    const result = await syncRepos(db, "t");

    expect(result.withOpenIssues).toEqual(["me/one"]);
  });
});

function issue(number: number, title: string) {
  return {
    number,
    title,
    state: "open",
    labels: [],
    html_url: `https://github.com/acme/widget/issues/${number}`,
    updated_at: "2026-08-05T00:00:00Z",
  };
}

function cached(): string[] {
  return db
    .select()
    .from(issuesCache)
    .all()
    .map((row) => `${row.repo}#${row.number}`)
    .sort();
}

// The bug: an issue closed on GitHub stayed in the console forever. Sync only
// ever upserted what was open, so nothing removed what no longer was.
describe("syncIssues", () => {
  it("caches the open issues of a repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([issue(1, "One"), issue(2, "Two")])),
    );

    await syncIssues(db, "t", {
      all: ["acme/widget"],
      withOpenIssues: ["acme/widget"],
    });

    expect(cached()).toEqual(["acme/widget#1", "acme/widget#2"]);
  });

  it("forgets an issue that is no longer open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([issue(1, "One"), issue(2, "Two")])),
    );
    await syncIssues(db, "t", {
      all: ["acme/widget"],
      withOpenIssues: ["acme/widget"],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([issue(1, "One")])),
    );
    await syncIssues(db, "t", {
      all: ["acme/widget"],
      withOpenIssues: ["acme/widget"],
    });

    expect(cached()).toEqual(["acme/widget#1"]);
  });

  // A repository whose last issue was closed is not fetched at all, because
  // GitHub already said it has none. Its rows still have to go.
  it("empties a repository that now has no open issues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([issue(1, "One")])),
    );
    await syncIssues(db, "t", {
      all: ["acme/widget"],
      withOpenIssues: ["acme/widget"],
    });

    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await syncIssues(db, "t", { all: ["acme/widget"], withOpenIssues: [] });

    expect(cached()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Losing access to a repository, or removing it, should not leave its issues
  // sitting in the console.
  it("forgets a repository the token can no longer see", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([issue(1, "One")])),
    );
    await syncIssues(db, "t", {
      all: ["acme/widget"],
      withOpenIssues: ["acme/widget"],
    });

    await syncIssues(db, "t", { all: [], withOpenIssues: [] });

    expect(cached()).toEqual([]);
  });
});
