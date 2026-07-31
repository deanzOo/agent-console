import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";

// Hoisted with the mock, because vi.mock is lifted above ordinary declarations.
interface MockState {
  searched: unknown[];
  workspaces: { gid: string }[];
}

const state = vi.hoisted((): MockState => ({
  searched: [],
  workspaces: [{ gid: "w1" }, { gid: "w2" }],
}));

function toolResult(json: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(json) }] };
}

vi.mock("./mcp/client", () => ({
  callTool: vi.fn(
    async (_spec: unknown, tool: string, args: Record<string, unknown>) => {
      if (tool === "asana_list_workspaces") {
        return toolResult({ data: state.workspaces });
      }
      state.searched.push(args.workspace);
      return toolResult({
        data:
          args.workspace === "w1"
            ? [{ gid: "t1", name: "One", completed: false }]
            : [{ gid: "t2", name: "Two", completed: false }],
      });
    },
  ),
}));

const { syncAsana } = await import("./sync");

let dir: string;
let db: Db;

beforeEach(() => {
  state.searched = [];
  state.workspaces = [{ gid: "w1" }, { gid: "w2" }];
  dir = mkdtempSync(path.join(tmpdir(), "asana-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("syncAsana", () => {
  // Only the first workspace was ever searched, so an account with tasks in the
  // second got zero and a report of success.
  it("searches every workspace the token can see", async () => {
    const result = await syncAsana(db, "token");

    expect(state.searched).toEqual(["w1", "w2"]);
    expect(result.tasks).toBe(2);
    expect(result.workspaces).toBe(2);
  });

  it("reports zero workspaces rather than pretending to have looked", async () => {
    state.workspaces = [];

    const result = await syncAsana(db, "token");

    expect(result).toEqual({ tasks: 0, workspaces: 0 });
    expect(state.searched).toEqual([]);
  });

  it("stores what it found", async () => {
    await syncAsana(db, "token");
    const rows = db.$client.prepare("SELECT gid FROM asana_cache ORDER BY gid").all();
    expect(rows).toHaveLength(2);
  });
});
