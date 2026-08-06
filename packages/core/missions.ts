import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ApprovalMode } from "./agents/policy";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Db } from "./db";
import { titleContains } from "./issues";
import {
  events,
  missions,
  pendingPrompts,
  type Mission,
  MISSION_STATUS,
  type MISSION_SOURCES,
  type MISSION_STATUSES,
  type PROMPT_KINDS,
} from "./schema";

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MissionSource = (typeof MISSION_SOURCES)[number];
export type PromptKind = (typeof PROMPT_KINDS)[number];

export interface NewMissionInput {
  readonly title: string;
  readonly source: MissionSource;
  readonly prompt: string;
  readonly sourceRef?: string | undefined;
  readonly repo?: string | undefined;
  readonly branch?: string | undefined;
  readonly worktreePath?: string | undefined;
}

export interface StoredEvent {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly payload: unknown;
}

export interface OpenPrompt {
  readonly id: string;
  readonly kind: PromptKind;
  readonly toolName: string | null;
  readonly input: unknown;
  readonly options: unknown;
  readonly createdAt: string;
}

export function createMission(db: Db, input: NewMissionInput): Mission {
  const row = db
    .insert(missions)
    .values({
      id: randomUUID(),
      title: input.title,
      status: MISSION_STATUS.STARTING,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      repo: input.repo ?? null,
      branch: input.branch ?? null,
      worktreePath: input.worktreePath ?? null,
    })
    .returning()
    .get();

  appendEvent(db, row.id, "mission.created", { prompt: input.prompt });
  return row;
}

export function getMission(db: Db, id: string): Mission | undefined {
  return db.select().from(missions).where(eq(missions.id, id)).get();
}

export interface MissionFilter {
  readonly status?: MissionStatus | undefined;
  readonly query?: string | undefined;
  /** Archived missions are excluded unless this asks for them instead. */
  readonly archived?: boolean | undefined;
  /** Only missions still going: starting, running, or waiting on the operator. */
  readonly active?: boolean | undefined;
  /** Only missions that are over: done, failed or stopped. */
  readonly finished?: boolean | undefined;
}

const LIVE_STATUSES = [
  MISSION_STATUS.STARTING,
  MISSION_STATUS.RUNNING,
  MISSION_STATUS.AWAITING_INPUT,
] as const;

/** Whether a mission in this status still holds a session — the line between
 * "offer to launch another" and "point at the one already running". */
export function isLiveStatus(status: MissionStatus): boolean {
  return LIVE_STATUSES.some((live) => live === status);
}

function conditionsFor(filter: MissionFilter): SQL[] {
  const query = filter.query?.trim();
  const conditions: SQL[] = [
    filter.archived ? isNotNull(missions.archivedAt) : isNull(missions.archivedAt),
  ];

  if (filter.active) conditions.push(inArray(missions.status, [...LIVE_STATUSES]));
  if (filter.finished) conditions.push(notInArray(missions.status, [...LIVE_STATUSES]));
  if (filter.status) conditions.push(eq(missions.status, filter.status));
  if (query) conditions.push(titleContains(missions.title, query));

  return conditions;
}

export function listMissions(db: Db, filter: MissionFilter = {}): Mission[] {
  const conditions = conditionsFor(filter);

  // rowid breaks ties: two missions created in the same millisecond share a
  // createdAt, and ordering by a random uuid would shuffle them.
  return db
    .select()
    .from(missions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(missions.createdAt), desc(sql`rowid`))
    .all();
}

/**
 * The most recent mission for each source ref that has one, keyed by ref.
 *
 * A ref can have several missions across retries; the issues and tasks lists
 * only want the current one, so ties are broken the same way listMissions
 * breaks them — newest createdAt, then rowid.
 */
export function latestMissionsBySourceRef(
  db: Db,
  source: MissionSource,
  sourceRefs: readonly string[],
): Map<string, Mission> {
  const map = new Map<string, Mission>();
  if (sourceRefs.length === 0) return map;

  const rows = db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.source, source),
        inArray(missions.sourceRef, [...sourceRefs]),
        isNull(missions.archivedAt),
      ),
    )
    .orderBy(desc(missions.createdAt), desc(sql`rowid`))
    .all();

  for (const row of rows) {
    if (row.sourceRef && !map.has(row.sourceRef)) map.set(row.sourceRef, row);
  }
  return map;
}

/** How many missions match, without loading them: the nav wants a number. */
export function countMissions(db: Db, filter: MissionFilter = {}): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(missions)
    .where(and(...conditionsFor(filter)))
    .get();
  return row?.count ?? 0;
}

export function countAwaitingInput(db: Db): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(missions)
    .where(
      and(
        eq(missions.status, MISSION_STATUS.AWAITING_INPUT),
        isNull(missions.archivedAt),
      ),
    )
    .get();
  return row?.count ?? 0;
}

// Archiving hides a mission and records when. Nothing is deleted: the
// transcript is the record of what an agent actually did, and the worktree is
// left alone because tidying a list should never destroy uncommitted work.
export function archiveMission(db: Db, id: string): void {
  db.update(missions)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(missions.id, id))
    .run();
}

export function restoreMission(db: Db, id: string): void {
  db.update(missions).set({ archivedAt: null }).where(eq(missions.id, id)).run();
}

/** A mission row the SQL below has already guaranteed has a real worktree path. */
export interface MissionWithWorktree extends Mission {
  readonly worktreePath: string;
}

function hasWorktreePath(mission: Mission): mission is MissionWithWorktree {
  return mission.worktreePath !== null && mission.worktreePath !== "";
}

// Disk usage cares about every mission that ever got a worktree, live or long
// archived — unlike listMissions, this deliberately ignores archivedAt. The
// filter is applied twice: once in SQL so the database does the work, and
// once as a type guard so callers see `worktreePath: string` instead of
// re-deriving the same guarantee the query already made.
export function listMissionsWithWorktree(db: Db): MissionWithWorktree[] {
  return db
    .select()
    .from(missions)
    .where(and(isNotNull(missions.worktreePath), ne(missions.worktreePath, "")))
    .all()
    .filter(hasWorktreePath);
}

export function setStatus(db: Db, id: string, status: MissionStatus): void {
  db.update(missions)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(missions.id, id))
    .run();
}

export interface WorkspaceRecord {
  readonly branch: string;
  readonly worktreePath: string;
}

/** The row exists before the worktree does, so the pair is written back here. */
export function recordWorkspace(db: Db, id: string, input: WorkspaceRecord): void {
  db.update(missions)
    .set({ branch: input.branch, worktreePath: input.worktreePath })
    .where(eq(missions.id, id))
    .run();
}

export function setSessionId(db: Db, id: string, sessionId: string): void {
  db.update(missions).set({ sessionId }).where(eq(missions.id, id)).run();
}

export function setMissionMode(db: Db, id: string, mode: ApprovalMode): void {
  db.update(missions).set({ mode }).where(eq(missions.id, id)).run();
}

// Sequence is allocated from the mission row inside a transaction so two
// concurrent appends cannot claim the same number.
export function appendEvent(
  db: Db,
  missionId: string,
  type: string,
  payload: unknown,
): StoredEvent {
  return db.transaction((tx) => {
    const mission = tx
      .update(missions)
      .set({ lastSeq: sql`${missions.lastSeq} + 1` })
      .where(eq(missions.id, missionId))
      .returning({ seq: missions.lastSeq })
      .get();

    if (!mission) throw new Error(`No such mission: ${missionId}`);

    const event = {
      missionId,
      seq: mission.seq,
      ts: new Date().toISOString(),
      type,
      payloadJson: JSON.stringify(payload),
    };
    tx.insert(events).values(event).run();

    return { seq: event.seq, ts: event.ts, type, payload };
  });
}

const createdPayload = z.object({ prompt: z.string() });

/**
 * What the mission was asked to do.
 *
 * Kept in the mission.created event rather than on the row, which is where
 * createMission has always put it. A queued mission needs it back to start,
 * possibly after a restart, so it is read from there rather than held in memory.
 */
export function missionPrompt(db: Db, missionId: string): string | undefined {
  for (const event of listEvents(db, missionId, 0)) {
    if (event.type !== "mission.created") continue;
    const parsed = createdPayload.safeParse(event.payload);
    if (parsed.success) return parsed.data.prompt;
  }
  return undefined;
}

export function listEvents(db: Db, missionId: string, since: number): StoredEvent[] {
  return db
    .select()
    .from(events)
    .where(and(eq(events.missionId, missionId), gt(events.seq, since)))
    .orderBy(events.seq)
    .all()
    .map((row) => ({
      seq: row.seq,
      ts: row.ts,
      type: row.type,
      payload: JSON.parse(row.payloadJson),
    }));
}

export interface NewPromptInput {
  readonly missionId: string;
  readonly kind: PromptKind;
  readonly toolName?: string | undefined;
  readonly input: unknown;
  readonly options?: unknown;
}

export function recordPrompt(db: Db, input: NewPromptInput): { id: string } {
  const id = randomUUID();
  db.insert(pendingPrompts)
    .values({
      id,
      missionId: input.missionId,
      kind: input.kind,
      toolName: input.toolName ?? null,
      inputJson: JSON.stringify(input.input ?? null),
      optionsJson: input.options === undefined ? null : JSON.stringify(input.options),
    })
    .run();
  return { id };
}

export function openPrompts(db: Db, missionId: string): OpenPrompt[] {
  return db
    .select()
    .from(pendingPrompts)
    .where(
      and(eq(pendingPrompts.missionId, missionId), isNull(pendingPrompts.answeredAt)),
    )
    .orderBy(pendingPrompts.createdAt)
    .all()
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      toolName: row.toolName,
      input: row.inputJson === null ? null : JSON.parse(row.inputJson),
      options: row.optionsJson === null ? null : JSON.parse(row.optionsJson),
      createdAt: row.createdAt,
    }));
}

export function answerPrompt(db: Db, promptId: string): void {
  db.update(pendingPrompts)
    .set({ answeredAt: new Date().toISOString() })
    .where(eq(pendingPrompts.id, promptId))
    .run();
}
