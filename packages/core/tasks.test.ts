import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { asanaCache } from "./schema";
import {
  UNFILED,
  countTasks,
  listTaskPage,
  listTaskProjects,
  listTaskWorkspaces,
} from "./tasks";

let dir: string;
let db: Db;

const rows = [
  {
    gid: "1",
    name: "Ship the invoice screen",
    project: "Billing",
    dueOn: "2026-08-02",
    workspaceGid: "w1",
    workspaceName: "Testy",
  },
  {
    gid: "2",
    name: "Fix invoice rounding",
    project: "Billing",
    dueOn: "2026-08-01",
    workspaceGid: "w1",
    workspaceName: "Testy",
  },
  {
    gid: "3",
    name: "Write the launch post",
    project: "Marketing",
    dueOn: null,
    workspaceGid: "w2",
    workspaceName: "TimerMe",
  },
  {
    gid: "4",
    name: "Unfiled thought",
    project: null,
    dueOn: "2026-08-05",
    workspaceGid: "w1",
    workspaceName: "Testy",
  },
  {
    gid: "5",
    name: "Old thing",
    project: "Billing",
    dueOn: "2026-07-01",
    completed: true,
  },
];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tasks-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
  for (const row of rows) {
    db.insert(asanaCache)
      .values({ ...row, completed: row.completed ?? false })
      .run();
  }
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("listTaskPage", () => {
  it("returns incomplete tasks by default", () => {
    expect(listTaskPage(db, {}).tasks.map((t) => t.gid)).not.toContain("5");
  });

  // Ordering by due date alone puts nulls first in SQLite, which buries
  // everything that actually has a deadline under everything that does not.
  it("puts dated tasks first, soonest first, then the undated", () => {
    expect(listTaskPage(db, {}).tasks.map((t) => t.gid)).toEqual(["2", "1", "4", "3"]);
  });

  it("narrows to a project", () => {
    expect(listTaskPage(db, { project: "Billing" }).tasks.map((t) => t.gid)) //
      .toEqual(["2", "1"]);
  });

  it("narrows to tasks with no project at all", () => {
    expect(listTaskPage(db, { project: UNFILED }).tasks.map((t) => t.gid)).toEqual([
      "4",
    ]);
  });

  it("searches names without regard to case", () => {
    expect(listTaskPage(db, { query: "INVOICE" }).tasks.map((t) => t.gid)) //
      .toEqual(["2", "1"]);
  });

  it("treats LIKE wildcards in the query as literal characters", () => {
    expect(listTaskPage(db, { query: "%" }).tasks).toHaveLength(0);
  });

  it("can ask for completed tasks instead", () => {
    expect(listTaskPage(db, { completed: true }).tasks.map((t) => t.gid)).toEqual([
      "5",
    ]);
  });

  it("reports the total that matched, not the number returned", () => {
    const page = listTaskPage(db, { limit: 2 });
    expect(page.tasks).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("counts what matches the filter", () => {
    expect(listTaskPage(db, { project: "Billing" }).total).toBe(2);
  });

  it("pages without overlap", () => {
    const first = listTaskPage(db, { limit: 2 }).tasks.map((t) => t.gid);
    const second = listTaskPage(db, { limit: 2, offset: 2 }).tasks.map((t) => t.gid);
    expect(new Set([...first, ...second]).size).toBe(4);
  });
});

describe("filtering by workspace", () => {
  it("narrows to one workspace", () => {
    expect(listTaskPage(db, { workspace: "w2" }).tasks.map((t) => t.gid)).toEqual([
      "3",
    ]);
  });

  it("counts only what is in that workspace", () => {
    expect(listTaskPage(db, { workspace: "w1" }).total).toBe(3);
  });

  it("combines with a project and a search", () => {
    const found = listTaskPage(db, {
      workspace: "w1",
      project: "Billing",
      query: "rounding",
    });
    expect(found.tasks.map((t) => t.gid)).toEqual(["2"]);
  });
});

describe("listTaskWorkspaces", () => {
  it("lists each workspace once, by name", () => {
    expect(listTaskWorkspaces(db)).toEqual([
      { gid: "w1", name: "Testy" },
      { gid: "w2", name: "TimerMe" },
    ]);
  });

  // A workspace whose name never arrived is still a thing you can filter by.
  it("falls back to the gid when there is no name", () => {
    db.$client.prepare("UPDATE asana_cache SET workspace_name = NULL").run();
    expect(listTaskWorkspaces(db)[0]).toEqual({ gid: "w1", name: "w1" });
  });
});

describe("listTaskProjects", () => {
  it("lists each project once, with unfiled last", () => {
    expect(listTaskProjects(db)).toEqual(["Billing", "Marketing", UNFILED]);
  });

  it("omits unfiled when everything has a project", () => {
    db.$client.prepare("DELETE FROM asana_cache WHERE gid = '4'").run();
    expect(listTaskProjects(db)).toEqual(["Billing", "Marketing"]);
  });
});

describe("countTasks", () => {
  it("counts incomplete tasks by default", () => {
    expect(countTasks(db)).toBe(4);
  });

  it("counts what matches a filter", () => {
    expect(countTasks(db, { project: "Billing" })).toBe(2);
    expect(countTasks(db, { completed: true })).toBe(1);
  });
});
