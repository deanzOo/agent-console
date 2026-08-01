import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { archiveMission, createMission, setStatus } from "./missions";
import { MISSION_STATUS } from "./schema";
import { statusSignature } from "./mission-feed";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "feed-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function mission(title: string) {
  return createMission(db, { title, source: "free", prompt: "p" }).id;
}

describe("statusSignature", () => {
  it("changes when a mission changes status", () => {
    const id = mission("one");
    const before = statusSignature(db);

    setStatus(db, id, MISSION_STATUS.DONE);

    expect(statusSignature(db)).not.toBe(before);
  });

  it("changes when a mission appears", () => {
    const before = statusSignature(db);
    mission("new");
    expect(statusSignature(db)).not.toBe(before);
  });

  it("changes when a mission is archived off the list", () => {
    const id = mission("one");
    const before = statusSignature(db);

    archiveMission(db, id);

    expect(statusSignature(db)).not.toBe(before);
  });

  // The screen is only refreshed when this differs, so an unstable row order
  // would refresh it forever and a stable one that ignores changes never would.
  it("stays the same when nothing changed", () => {
    mission("one");
    mission("two");

    expect(statusSignature(db)).toBe(statusSignature(db));
  });

  it("is empty when there are no missions", () => {
    expect(statusSignature(db)).toBe("");
  });
});
