import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { openDatabase, type Db } from "./db";
import { events, missions, settings } from "./schema";

let dir: string;
let db: Db;

function dbPath() {
  return path.join(dir, "nested", "data.db");
}

function causeChain(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    return messages.join(" | ");
  }
  return "";
}

function tableNames(database: Db): string[] {
  const rows = database.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  return rows.map((row) => row.name);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-db-"));
});

afterEach(() => {
  db?.$client.close();
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
    expect(tableNames(db)).toEqual(
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
        .insert(events)
        .values({
          missionId: "missing-mission",
          seq: 1,
          ts: "2026-01-01T00:00:00Z",
          type: "text",
          payloadJson: "{}",
        })
        .run(),
    ).toThrowError(/FOREIGN KEY/i);
  });

  it("runs in WAL mode so a reader never blocks the agent loop", () => {
    db = openDatabase(dbPath());
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("is idempotent — reopening an existing database preserves rows", () => {
    const first = openDatabase(dbPath());
    first.insert(settings).values({ key: "k", value: "v" }).run();
    first.$client.close();

    db = openDatabase(dbPath());
    const row = db.select().from(settings).get();
    expect(row?.value).toBe("v");
  });

  it("rejects a duplicate event sequence within one mission", () => {
    db = openDatabase(dbPath());
    db.insert(missions)
      .values({ id: "m1", title: "t", status: "running", source: "free" })
      .run();

    const event = {
      missionId: "m1",
      seq: 1,
      ts: "2026-01-01T00:00:00Z",
      type: "text",
      payloadJson: "{}",
    };
    db.insert(events).values(event).run();

    expect(() =>
      db
        .insert(events)
        .values({ ...event, ts: "2026-01-01T00:00:01Z" })
        .run(),
    ).toThrowError(/UNIQUE|PRIMARY KEY/i);
  });

  it("rejects a mission status outside the known lifecycle", () => {
    db = openDatabase(dbPath());
    // Drizzle wraps driver errors, so the constraint name is on the cause.
    expect(() =>
      db.run(
        sql`INSERT INTO missions (id, title, status, source) VALUES ('m2', 't', 'exploded', 'free')`,
      ),
    ).toThrowError(expect.objectContaining({ cause: expect.any(Error) }));

    expect(
      causeChain(() =>
        db.run(
          sql`INSERT INTO missions (id, title, status, source) VALUES ('m3', 't', 'exploded', 'free')`,
        ),
      ),
    ).toMatch(/CHECK constraint failed: missions_status_valid/i);
  });

  it("rejects a mission source outside the known set", () => {
    db = openDatabase(dbPath());
    expect(
      causeChain(() =>
        db.run(
          sql`INSERT INTO missions (id, title, status, source) VALUES ('m4', 't', 'running', 'jira')`,
        ),
      ),
    ).toMatch(/CHECK constraint failed: missions_source_valid/i);
  });

  it("rejects a blank settings value at the database level", () => {
    db = openDatabase(dbPath());
    expect(
      causeChain(() =>
        db.run(sql`INSERT INTO settings (key, value) VALUES ('k', '  ')`),
      ),
    ).toMatch(/CHECK constraint failed: settings_value_not_blank/i);
  });
});
