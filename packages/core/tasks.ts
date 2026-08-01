import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Db } from "./db";
import { titleContains } from "./issues";
import { asanaCache } from "./schema";

export type CachedTask = typeof asanaCache.$inferSelect;

export interface TaskFilter {
  readonly workspace?: string | undefined;
  readonly project?: string | undefined;
  readonly query?: string | undefined;
  /** Completed tasks are excluded unless this asks for them instead. */
  readonly completed?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

const DEFAULT_LIMIT = 25;

// A task with no project is not in some project called "none"; it is unfiled,
// and asking for unfiled tasks is a real thing to want.
export const UNFILED = "(no project)";

function conditionsFor(filter: TaskFilter): SQL[] {
  const query = filter.query?.trim();
  const conditions: SQL[] = [eq(asanaCache.completed, filter.completed ?? false)];

  if (filter.workspace) conditions.push(eq(asanaCache.workspaceGid, filter.workspace));

  if (filter.project === UNFILED) conditions.push(isNull(asanaCache.project));
  else if (filter.project) conditions.push(eq(asanaCache.project, filter.project));

  if (query) conditions.push(titleContains(asanaCache.name, query));

  return conditions;
}

export interface TaskPage {
  readonly tasks: CachedTask[];
  readonly total: number;
}

export function listTaskPage(db: Db, filter: TaskFilter): TaskPage {
  const where = and(...conditionsFor(filter));

  const counted = db
    .select({ total: sql<number>`count(*)` })
    .from(asanaCache)
    .where(where)
    .get();

  const tasks = db
    .select()
    .from(asanaCache)
    .where(where)
    // Due first, then undated. Ordering by due_on alone puts nulls first in
    // SQLite, which buries everything that actually has a deadline.
    .orderBy(sql`${asanaCache.dueOn} is null`, asc(asanaCache.dueOn))
    .limit(filter.limit ?? DEFAULT_LIMIT)
    .offset(filter.offset ?? 0)
    .all();

  return { tasks, total: counted?.total ?? 0 };
}

export interface TaskWorkspace {
  readonly gid: string;
  readonly name: string;
}

export function listTaskWorkspaces(db: Db): TaskWorkspace[] {
  return (
    db
      .selectDistinct({ gid: asanaCache.workspaceGid, name: asanaCache.workspaceName })
      .from(asanaCache)
      .where(eq(asanaCache.completed, false))
      .all()
      .filter((row): row is { gid: string; name: string | null } => row.gid !== null)
      // A workspace whose name never arrived is still one you can filter by.
      .map((row) => ({ gid: row.gid, name: row.name ?? row.gid }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

export function listTaskProjects(db: Db): string[] {
  const rows = db
    .selectDistinct({ project: asanaCache.project })
    .from(asanaCache)
    .where(eq(asanaCache.completed, false))
    .all();

  const named = rows
    .map((row) => row.project)
    .filter((project): project is string => project !== null)
    .sort((a, b) => a.localeCompare(b));

  return rows.some((row) => row.project === null) ? [...named, UNFILED] : named;
}
