import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { openDatabase } from "./db";

let dir: string;
let db: Database;

function dbPath() {
  return path.join(dir, "nested", "data.db");
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-db-"));
});

afterEach(() => {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("creates the database file and any missing parent directories", () => {
    db = openDatabase(dbPath());
    expect(statSync(dbPath()).isFile()).toBe(true);
  });

  it("restricts the file to the owner, since it stores credentials", () => {
    db = openDatabase(dbPath());
    expect(statSync(dbPath()).mode & 0o777).toBe(0o600);
  });

  it("creates every table the app depends on", () => {
    db = openDatabase(dbPath());
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => Object(row).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "missions",
        "events",
        "pending_prompts",
        "repos",
        "issues_cache",
        "asana_cache",
        "push_subscriptions",
        "settings",
      ]),
    );
  });

  it("enforces foreign keys so events cannot outlive their mission", () => {
    db = openDatabase(dbPath());
    expect(() =>
      db
        .prepare(
          "INSERT INTO events (mission_id, seq, ts, type, payload_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run("missing-mission", 1, "2026-01-01T00:00:00Z", "text", "{}"),
    ).toThrowError(/FOREIGN KEY/i);
  });

  it("runs in WAL mode so a reader never blocks the agent loop", () => {
    db = openDatabase(dbPath());
    const row = db.pragma("journal_mode", { simple: true });
    expect(row).toBe("wal");
  });

  it("is idempotent — reopening an existing database preserves rows", () => {
    const first = openDatabase(dbPath());
    first.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("k", "v");
    first.close();

    db = openDatabase(dbPath());
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("k");
    expect(Object(row).value).toBe("v");
  });

  it("rejects a duplicate event sequence within one mission", () => {
    db = openDatabase(dbPath());
    db.prepare(
      "INSERT INTO missions (id, title, status, source) VALUES (?, ?, ?, ?)",
    ).run("m1", "t", "running", "free");
    const insert = db.prepare(
      "INSERT INTO events (mission_id, seq, ts, type, payload_json) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run("m1", 1, "2026-01-01T00:00:00Z", "text", "{}");
    expect(() =>
      insert.run("m1", 1, "2026-01-01T00:00:01Z", "text", "{}"),
    ).toThrowError(/UNIQUE|PRIMARY KEY/i);
  });

  it("rejects a mission status outside the known lifecycle", () => {
    db = openDatabase(dbPath());
    expect(() =>
      db
        .prepare("INSERT INTO missions (id, title, status, source) VALUES (?, ?, ?, ?)")
        .run("m2", "t", "exploded", "free"),
    ).toThrowError(/CHECK/i);
  });
});
