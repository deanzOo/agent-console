import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
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
}

export function listMissions(db: Db, filter: MissionFilter = {}): Mission[] {
  const query = filter.query?.trim();
  const conditions: SQL[] = [];

  conditions.push(
    filter.archived ? isNotNull(missions.archivedAt) : isNull(missions.archivedAt),
  );
  if (filter.status) conditions.push(eq(missions.status, filter.status));
  if (query) {
    conditions.push(titleContains(missions.title, query));
  }

  // rowid breaks ties: two missions created in the same millisecond share a
  // createdAt, and ordering by a random uuid would shuffle them.
  return db
    .select()
    .from(missions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(missions.createdAt), desc(sql`rowid`))
    .all();
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
