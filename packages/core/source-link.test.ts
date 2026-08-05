import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { asanaCache } from "./schema";
import { createMission } from "./missions";
import { sourceLinkFor } from "./source-link";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "source-link-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("sourceLinkFor", () => {
  it("points a github mission at its issue, with no cache to consult", () => {
    const mission = createMission(db, {
      title: "Fix it",
      source: "github",
      sourceRef: "acme/widget#7",
      repo: "acme/widget",
      prompt: "p",
    });

    expect(sourceLinkFor(db, mission)).toEqual({
      label: "acme/widget#7",
      url: "https://github.com/acme/widget/issues/7",
    });
  });

  it("points an asana mission at its cached permalink", () => {
    db.insert(asanaCache)
      .values({
        gid: "task1",
        name: "Ship it",
        permalink: "https://app.asana.com/0/1/task1",
      })
      .run();
    const mission = createMission(db, {
      title: "Ship it",
      source: "asana",
      sourceRef: "task1",
      prompt: "p",
    });

    expect(sourceLinkFor(db, mission)).toEqual({
      label: "Ship it",
      url: "https://app.asana.com/0/1/task1",
    });
  });

  // The task fell out of the cache — completed, or never synced since a
  // restore — but the mission still knows it came from Asana.
  it("names an asana task with no link when it is not cached", () => {
    const mission = createMission(db, {
      title: "Ship it",
      source: "asana",
      sourceRef: "task-gone",
      prompt: "p",
    });

    expect(sourceLinkFor(db, mission)).toEqual({ label: "Asana task", url: undefined });
  });

  it("says nothing for a mission with no source of its own", () => {
    const mission = createMission(db, { title: "Ad hoc", source: "free", prompt: "p" });
    expect(sourceLinkFor(db, mission)).toBeUndefined();
  });

  it("says nothing for a github mission missing its repo or issue number", () => {
    const mission = createMission(db, {
      title: "Fix it",
      source: "github",
      sourceRef: "not-a-ref",
      prompt: "p",
    });
    expect(sourceLinkFor(db, mission)).toBeUndefined();
  });
});
