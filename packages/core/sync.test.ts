import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { repos } from "./schema";
import { syncRepos } from "./sync";

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
