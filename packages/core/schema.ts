import { sql, type SQLWrapper } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// Drizzle's `enum` option is TypeScript-only and emits no SQL constraint, so
// each one needs a matching CHECK to hold at the database level too.
// sql.raw because a bound parameter does not survive into DDL.
function oneOf(column: SQLWrapper, values: readonly string[]) {
  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
  return sql`${column} IN (${sql.raw(literals)})`;
}

export const MISSION_STATUS = {
  STARTING: "starting",
  RUNNING: "running",
  AWAITING_INPUT: "awaiting_input",
  DONE: "done",
  FAILED: "failed",
  STOPPED: "stopped",
} as const;

export const MISSION_STATUSES = [
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
  MISSION_STATUS.DONE,
  MISSION_STATUS.FAILED,
  MISSION_STATUS.STOPPED,
] as const;

export const MISSION_SOURCE = {
  FREE: "free",
  GITHUB: "github",
  ASANA: "asana",
} as const;

export const MISSION_SOURCES = [
  MISSION_SOURCE.FREE,
  MISSION_SOURCE.GITHUB,
  MISSION_SOURCE.ASANA,
] as const;

export const missions = sqliteTable(
  "missions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status", { enum: MISSION_STATUSES }).notNull(),
    source: text("source", { enum: MISSION_SOURCES }).notNull(),
    sourceRef: text("source_ref"),
    repo: text("repo"),
    branch: text("branch"),
    worktreePath: text("worktree_path"),
    sessionId: text("session_id"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    lastSeq: integer("last_seq").notNull().default(0),
    // Null means active. A timestamp both hides the mission and records when,
    // which is the question an archive is asked: when did I stop caring.
    archivedAt: text("archived_at"),
  },
  (table) => [
    index("missions_status_idx").on(table.status),
    check("missions_status_valid", oneOf(table.status, MISSION_STATUSES)),
    check("missions_source_valid", oneOf(table.source, MISSION_SOURCES)),
  ],
);

// (missionId, seq) is what makes the SSE `?since=` cursor durable across a
// phone sleeping mid-mission.
export const events = sqliteTable(
  "events",
  {
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    ts: text("ts").notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.missionId, table.seq] })],
);

export const PROMPT_KIND = {
  TOOL_APPROVAL: "tool_approval",
  QUESTION: "question",
} as const;

export const PROMPT_KINDS = [PROMPT_KIND.TOOL_APPROVAL, PROMPT_KIND.QUESTION] as const;

export const pendingPrompts = sqliteTable(
  "pending_prompts",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: PROMPT_KINDS }).notNull(),
    toolName: text("tool_name"),
    inputJson: text("input_json"),
    optionsJson: text("options_json"),
    createdAt: text("created_at").notNull().default(now),
    answeredAt: text("answered_at"),
  },
  (table) => [
    index("pending_prompts_open_idx")
      .on(table.missionId)
      .where(sql`${table.answeredAt} IS NULL`),
    check("pending_prompts_kind_valid", oneOf(table.kind, PROMPT_KINDS)),
  ],
);

export const repos = sqliteTable("repos", {
  fullName: text("full_name").primaryKey(),
  defaultBranch: text("default_branch"),
  barePath: text("bare_path"),
  lastSyncedAt: text("last_synced_at"),
});

export const issuesCache = sqliteTable(
  "issues_cache",
  {
    repo: text("repo").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    labelsJson: text("labels_json").notNull().default("[]"),
    url: text("url").notNull(),
    updatedAt: text("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.repo, table.number] })],
);

export const asanaCache = sqliteTable("asana_cache", {
  gid: text("gid").primaryKey(),
  name: text("name").notNull(),
  project: text("project"),
  dueOn: text("due_on"),
  permalink: text("permalink"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at"),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  keysJson: text("keys_json").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const settings = sqliteTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  },
  (table) => [check("settings_value_not_blank", sql`trim(${table.value}) <> ''`)],
);

export type Mission = typeof missions.$inferSelect;
export type NewMission = typeof missions.$inferInsert;
export type MissionEvent = typeof events.$inferSelect;
export type PendingPrompt = typeof pendingPrompts.$inferSelect;
export type CachedIssue = typeof issuesCache.$inferSelect;
export type CachedAsanaTask = typeof asanaCache.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
