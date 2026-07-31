import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "./env";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// The folder is passed in rather than derived here: the app is started from
// the web package's directory, so anything cwd-relative resolves somewhere the
// migrations are not, and the failure reads "Can't find meta/_journal.json"
// without naming a path.
export function openDatabase(file: string, migrationsFolder?: string): Db {
  mkdirSync(path.dirname(file), { recursive: true });

  const connection = new Database(file);
  // WAL so SSE readers never block the agent loop's writes.
  connection.pragma("journal_mode = WAL");
  // SQLite defaults these off.
  connection.pragma("foreign_keys = ON");

  const db = drizzle(connection, { schema });
  migrate(db, {
    migrationsFolder: migrationsFolder ?? path.join(process.cwd(), "drizzle"),
  });

  // Holds tokens and push keys; the umask decides the mode at creation.
  chmodSync(file, 0o600);

  return db;
}

let cached: Db | undefined;

export function getDatabase(): Db {
  const config = getConfig();
  cached ??= openDatabase(path.join(config.dataDir, "data.db"), config.migrationsDir);
  return cached;
}
