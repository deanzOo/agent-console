import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "@/config/env";
import * as schema from "./schema";

// Resolved at runtime: a `new URL(..., import.meta.url)` here is treated as a
// static import by the bundler and fails the build.
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function openDatabase(file: string): Db {
  mkdirSync(path.dirname(file), { recursive: true });

  const connection = new Database(file);
  // WAL so SSE readers never block the agent loop's writes.
  connection.pragma("journal_mode = WAL");
  // SQLite defaults these off.
  connection.pragma("foreign_keys = ON");

  const db = drizzle(connection, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  // Holds tokens and push keys; the umask decides the mode at creation.
  chmodSync(file, 0o600);

  return db;
}

let cached: Db | undefined;

export function getDatabase(): Db {
  cached ??= openDatabase(path.join(getConfig().dataDir, "data.db"));
  return cached;
}
