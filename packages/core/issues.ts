import { and, desc, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Db } from "./db";
import { issuesCache } from "./schema";

export type CachedIssue = typeof issuesCache.$inferSelect;

export interface IssueFilter {
  readonly offset?: number | undefined;
  readonly org?: string | undefined;
  readonly repo?: string | undefined;
  readonly label?: string | undefined;
  readonly query?: string | undefined;
  readonly limit?: number | undefined;
}

const DEFAULT_LIMIT = 100;

// The query reaches SQL as a LIKE pattern and arrives from a URL, where "%"
// matches everything and "_" matches anything. Escaping them keeps a search for
// a literal underscore from quietly returning the whole table.
export function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/** Case-insensitive contains, with LIKE's own wildcards escaped. */
export function titleContains(column: SQLWrapper, query: string): SQL {
  return sql`${column} LIKE ${likePattern(query)} ESCAPE '\\'`;
}

// The owner is everything before the slash. Matched with the slash included so
// "acme" cannot also select "acme-labs", which is a different organisation.
function inOrg(org: string): SQL {
  return sql`${issuesCache.repo} LIKE ${`${org.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`} ESCAPE '\\'`;
}

// labels_json holds a JSON array, so the match goes through json_each rather
// than a LIKE over the serialised text — "mobile" must not match "mobile-only".
function hasLabel(label: string): SQL {
  return sql`EXISTS (
    SELECT 1 FROM json_each(${issuesCache.labelsJson}) WHERE json_each.value = ${label}
  )`;
}

function conditionsFor(filter: IssueFilter): SQL[] {
  const query = filter.query?.trim();
  const conditions: SQL[] = [];

  if (filter.org) conditions.push(inOrg(filter.org));
  if (filter.repo) conditions.push(eq(issuesCache.repo, filter.repo));
  if (filter.label) conditions.push(hasLabel(filter.label));
  if (query) conditions.push(titleContains(issuesCache.title, query));

  return conditions;
}

export interface IssuePage {
  readonly issues: CachedIssue[];
  readonly total: number;
}

/**
 * A page of issues and how many matched in total.
 *
 * The count is the point: a list silently cut at the limit tells the operator
 * they have seen everything when they have not.
 */
export function listIssuePage(db: Db, filter: IssueFilter): IssuePage {
  const conditions = conditionsFor(filter);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const counted = db
    .select({ total: sql<number>`count(*)` })
    .from(issuesCache)
    .where(where)
    .get();

  return { issues: listIssues(db, filter), total: counted?.total ?? 0 };
}

export function listIssues(db: Db, filter: IssueFilter): CachedIssue[] {
  const conditions = conditionsFor(filter);

  return db
    .select()
    .from(issuesCache)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(issuesCache.updatedAt))
    .limit(filter.limit ?? DEFAULT_LIMIT)
    .offset(filter.offset ?? 0)
    .all();
}

/** How many match, without loading them: the nav wants a number. */
export function countIssues(db: Db, filter: IssueFilter = {}): number {
  const conditions = conditionsFor(filter);
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(issuesCache)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .get();
  return row?.count ?? 0;
}

export function listIssueOrgs(db: Db): string[] {
  return db
    .selectDistinct({ repo: issuesCache.repo })
    .from(issuesCache)
    .all()
    .map((row) => row.repo.split("/")[0] ?? "")
    .filter((org, index, all) => org !== "" && all.indexOf(org) === index)
    .sort((a, b) => a.localeCompare(b));
}

export function listIssueRepos(
  db: Db,
  filter: Pick<IssueFilter, "org"> = {},
): string[] {
  const conditions = conditionsFor(filter);

  return db
    .selectDistinct({ repo: issuesCache.repo })
    .from(issuesCache)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${issuesCache.repo} collate nocase`)
    .all()
    .map((row) => row.repo);
}

export function listIssueLabels(
  db: Db,
  filter: Pick<IssueFilter, "org" | "repo"> = {},
): string[] {
  const conditions = conditionsFor(filter);

  return db
    .select({ label: sql<string>`json_each.value` })
    .from(sql`${issuesCache}, json_each(${issuesCache.labelsJson})`)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`json_each.value`)
    .orderBy(sql`json_each.value collate nocase`)
    .all()
    .map((row) => row.label);
}
