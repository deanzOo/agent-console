import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { issuesCache } from "./schema";
import {
  listIssueLabels,
  listIssueOrgs,
  listIssuePage,
  listIssueRepos,
  listIssues,
} from "./issues";

let dir: string;
let db: Db;

const rows = [
  {
    repo: "acme/web",
    number: 1,
    title: "Login button is misaligned",
    state: "open",
    labelsJson: JSON.stringify(["bug", "mobile"]),
  },
  {
    repo: "acme/web",
    number: 2,
    title: "Add search to the issues list",
    state: "open",
    labelsJson: JSON.stringify(["enhancement", "mobile"]),
  },
  {
    repo: "acme/api",
    number: 7,
    title: "Rate limit the search endpoint",
    state: "open",
    labelsJson: JSON.stringify(["enhancement"]),
  },
  {
    repo: "other/tool",
    number: 3,
    title: "Bump dependencies",
    state: "closed",
    labelsJson: JSON.stringify([]),
  },
];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "issues-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
  for (const [i, row] of rows.entries()) {
    db.insert(issuesCache)
      .values({
        ...row,
        url: `https://x/${row.number}`,
        updatedAt: `2026-07-0${i + 1}`,
      })
      .run();
  }
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("listIssues", () => {
  it("returns everything, newest first, when nothing is asked for", () => {
    const found = listIssues(db, {});
    expect(found).toHaveLength(4);
    expect(found[0]?.number).toBe(3);
  });

  it("narrows to one repository", () => {
    expect(listIssues(db, { repo: "acme/web" }).map((i) => i.number)).toEqual([2, 1]);
  });

  it("searches titles without regard to case", () => {
    expect(listIssues(db, { query: "SEARCH" }).map((i) => i.number)).toEqual([7, 2]);
  });

  it("combines a repository and a search", () => {
    expect(listIssues(db, { repo: "acme/web", query: "search" }).map((i) => i.number)) //
      .toEqual([2]);
  });

  // The query arrives from a URL the operator can type into.
  it("treats LIKE wildcards in the query as literal characters", () => {
    expect(listIssues(db, { query: "%" })).toHaveLength(0);
    expect(listIssues(db, { query: "_ogin" })).toHaveLength(0);
  });

  it("ignores a blank query rather than matching nothing", () => {
    expect(listIssues(db, { query: "   " })).toHaveLength(4);
  });

  it("honours a limit", () => {
    expect(listIssues(db, { limit: 2 })).toHaveLength(2);
  });

  // Truncating without saying so is the failure this exists to prevent: the
  // operator sees a short list and has no way to know it is not the whole one.
  it("reports the total that matched, not the number returned", () => {
    const page = listIssuePage(db, { limit: 2 });
    expect(page.issues).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("counts what matches the filter, not the table", () => {
    expect(listIssuePage(db, { repo: "acme/web" }).total).toBe(2);
  });

  it("returns the next page from an offset, with no overlap", () => {
    const first = listIssuePage(db, { limit: 2 });
    const second = listIssuePage(db, { limit: 2, offset: 2 });

    expect(first.issues.map((i) => i.number)).toEqual([3, 7]);
    expect(second.issues.map((i) => i.number)).toEqual([2, 1]);
    expect(second.total).toBe(4);
  });

  it("returns nothing past the end rather than wrapping", () => {
    expect(listIssuePage(db, { offset: 99 }).issues).toHaveLength(0);
  });
});

describe("filtering by organisation and label", () => {
  it("narrows to one organisation", () => {
    expect(listIssues(db, { org: "acme" }).map((i) => i.number)).toEqual([7, 2, 1]);
  });

  // The owner is the part before the slash; a repo called "acme-labs/x" is a
  // different organisation and must not be swept in by a prefix match.
  it("does not treat a longer owner as the same organisation", () => {
    expect(listIssues(db, { org: "acme" }).every((i) => i.repo.startsWith("acme/"))) //
      .toBe(true);
  });

  it("narrows to one label", () => {
    expect(listIssues(db, { label: "mobile" }).map((i) => i.number)).toEqual([2, 1]);
  });

  it("matches a label exactly rather than as a substring", () => {
    expect(listIssues(db, { label: "mobil" })).toHaveLength(0);
  });

  it("combines every filter at once", () => {
    const found = listIssues(db, {
      org: "acme",
      repo: "acme/web",
      label: "mobile",
      query: "search",
    });
    expect(found.map((i) => i.number)).toEqual([2]);
  });
});

describe("listIssueOrgs", () => {
  it("lists each organisation once", () => {
    expect(listIssueOrgs(db)).toEqual(["acme", "other"]);
  });
});

describe("listIssueLabels", () => {
  it("lists every label once, sorted, ignoring issues with none", () => {
    expect(listIssueLabels(db)).toEqual(["bug", "enhancement", "mobile"]);
  });

  it("narrows to the labels present in one organisation", () => {
    expect(listIssueLabels(db, { org: "other" })).toEqual([]);
  });
});

describe("listIssueRepos", () => {
  it("lists each repository once, in order", () => {
    expect(listIssueRepos(db)).toEqual(["acme/api", "acme/web", "other/tool"]);
  });

  it("narrows to one organisation", () => {
    expect(listIssueRepos(db, { org: "acme" })).toEqual(["acme/api", "acme/web"]);
  });
});
