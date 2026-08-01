import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { syncAsana } from "./sync";
import { listTaskPage } from "./tasks";

interface MockState {
  searched: string[];
  workspaces: { gid: string; name?: string }[];
}

const state: MockState = { searched: [], workspaces: [] };

function stubAsana(failWith?: { status: number; message: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (failWith) {
        return Response.json(
          { errors: [{ message: failWith.message }] },
          { status: failWith.status },
        );
      }
      if (url.endsWith("/workspaces")) {
        return Response.json({ data: state.workspaces });
      }

      const workspace = new URL(url).searchParams.get("workspace") ?? "";
      state.searched.push(workspace);
      return Response.json({
        data:
          workspace === "w1"
            ? [{ gid: "t1", name: "One", completed: false }]
            : [{ gid: "t2", name: "Two", completed: false }],
      });
    }),
  );
}

let dir: string;
let db: Db;

beforeEach(() => {
  state.searched = [];
  state.workspaces = [
    { gid: "w1", name: "Testy" },
    { gid: "w2", name: "TimerMe" },
  ];
  stubAsana();
  dir = mkdtempSync(path.join(tmpdir(), "asana-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("syncAsana", () => {
  // Only the first workspace was ever searched, so an account with tasks in the
  // second got zero and a report of success.
  it("searches every workspace the token can see", async () => {
    const result = await syncAsana(db, "token");

    expect(state.searched).toEqual(["w1", "w2"]);
    expect(result).toEqual({ tasks: 2, workspaces: 2 });
  });

  // Asana explains itself properly. Swallowing that is exactly how a
  // premium-only endpoint looked like an empty account.
  it("surfaces an Asana error rather than reporting no tasks", async () => {
    stubAsana({ status: 402, message: "Search is only available to premium users." });

    await expect(syncAsana(db, "token")).rejects.toThrow(/premium users/);
  });

  it("asks for your incomplete tasks, with the fields the cache stores", async () => {
    await syncAsana(db, "token");

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    const taskCall = urls.find((url) => url.includes("/tasks?")) ?? "";

    expect(taskCall).toContain("assignee=me");
    expect(taskCall).toContain("completed_since=now");
    expect(taskCall).toContain("opt_fields=");
  });

  it("reports zero workspaces rather than pretending to have looked", async () => {
    state.workspaces = [];

    expect(await syncAsana(db, "token")).toEqual({ tasks: 0, workspaces: 0 });
    expect(state.searched).toEqual([]);
  });

  it("stores what it found", async () => {
    await syncAsana(db, "token");
    expect(db.$client.prepare("SELECT gid FROM asana_cache").all()).toHaveLength(2);
  });

  // Without this a task cannot say which workspace it came from, and the list
  // cannot be filtered by one.
  it("records the workspace each task came from", async () => {
    await syncAsana(db, "token");

    const rows = listTaskPage(db, {}).tasks;
    const byGid = new Map(rows.map((t) => [t.gid, t]));

    expect(byGid.get("t1")).toMatchObject({
      workspaceGid: "w1",
      workspaceName: "Testy",
    });
    expect(byGid.get("t2")).toMatchObject({
      workspaceGid: "w2",
      workspaceName: "TimerMe",
    });
  });

  it("survives a workspace with no name", async () => {
    state.workspaces = [{ gid: "w1" }];
    await syncAsana(db, "token");

    expect(listTaskPage(db, {}).tasks[0]).toMatchObject({
      workspaceGid: "w1",
      workspaceName: null,
    });
  });
});
