import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "../db";
import { archiveMission, createMission, setStatus } from "../missions";
import { MISSION_STATUS } from "../schema";
import { setSetting } from "../settings";
import {
  DEFAULT_MAX_CONCURRENT,
  concurrencyLimit,
  hasCapacity,
  nextQueued,
} from "./queue";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "queue-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function queued(title: string, createdAt?: string) {
  const mission = createMission(db, { title, source: "free", prompt: "p" });
  setStatus(db, mission.id, MISSION_STATUS.QUEUED);
  if (createdAt) {
    db.$client
      .prepare("UPDATE missions SET created_at = ? WHERE id = ?")
      .run(createdAt, mission.id);
  }
  return mission.id;
}

describe("concurrencyLimit", () => {
  // Each mission is a whole Claude Code process. The box this runs on has two
  // cores, and running more than it was told to is what took it down.
  it("defaults to something a small box survives", () => {
    expect(concurrencyLimit(db)).toBe(DEFAULT_MAX_CONCURRENT);
  });

  it("takes the operator's number", () => {
    setSetting(db, "max_concurrent_missions", "5");

    expect(concurrencyLimit(db)).toBe(5);
  });

  // A cap of zero would accept missions and start none of them, which looks
  // exactly like the app being broken.
  it.each(["0", "-3", "lots", ""])("falls back when the setting reads %o", (value) => {
    setSetting(db, "max_concurrent_missions", value);

    expect(concurrencyLimit(db)).toBe(DEFAULT_MAX_CONCURRENT);
  });
});

describe("hasCapacity", () => {
  it("has room below the limit", () => {
    expect(hasCapacity(1, 2)).toBe(true);
  });

  it("has none at the limit", () => {
    expect(hasCapacity(2, 2)).toBe(false);
  });

  // Recovery can bring back more than the cap allows, and the queue must not
  // then start yet another on top.
  it("has none above it", () => {
    expect(hasCapacity(5, 2)).toBe(false);
  });
});

describe("nextQueued", () => {
  it("is nothing when the queue is empty", () => {
    createMission(db, { title: "running one", source: "free", prompt: "p" });

    expect(nextQueued(db)).toBeUndefined();
  });

  // First in, first out: a mission that has waited longest goes next, or the
  // queue is a lottery.
  it("takes the one that has waited longest", () => {
    queued("second", "2026-08-05T10:00:00.000Z");
    const first = queued("first", "2026-08-05T09:00:00.000Z");

    expect(nextQueued(db)?.id).toBe(first);
  });

  it("ignores a queued mission that was archived", () => {
    const only = queued("archived");
    archiveMission(db, only);

    expect(nextQueued(db)).toBeUndefined();
  });

  it("ignores missions that are not queued", () => {
    const mission = createMission(db, { title: "live", source: "free", prompt: "p" });
    setStatus(db, mission.id, MISSION_STATUS.RUNNING);

    expect(nextQueued(db)).toBeUndefined();
  });
});
