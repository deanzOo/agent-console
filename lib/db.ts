import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { getConfig } from "@/config/env";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));

/**
 * Opens (creating if needed) the SQLite database and applies the schema.
 *
 * Safe to call on an existing database: every statement in schema.sql is
 * `IF NOT EXISTS`, so this doubles as the boot-time migration step.
 */
export function openDatabase(file: string): Database.Database {
  mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);

  // WAL lets the SSE readers and the settings UI read while the agent loop is
  // appending events, instead of serialising behind a write lock.
  db.pragma("journal_mode = WAL");
  // Off by default in SQLite, so an orphaned event would otherwise be accepted.
  db.pragma("foreign_keys = ON");

  db.exec(readFileSync(SCHEMA_PATH, "utf8"));

  // The file holds tokens and push keys. Applied after creation because the
  // umask decides the initial mode.
  chmodSync(file, 0o600);

  return db;
}

let cached: Database.Database | undefined;

/** Process-wide handle. The app is deliberately single-process — see CLAUDE.md. */
export function getDatabase(): Database.Database {
  cached ??= openDatabase(path.join(getConfig().dataDir, "data.db"));
  return cached;
}
