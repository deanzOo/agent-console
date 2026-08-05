import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { events, missions, pendingPrompts } from "./schema";

const RESULT_EVENT_TYPE = "agent.result";

// Only the field this screen cares about is asserted — the rest of a result
// payload is the Agent SDK's business, not ours.
const resultPayloadSchema = z.object({ total_cost_usd: z.number() });

export interface MissionCost {
  readonly missionId: string;
  readonly title: string;
  readonly usd: number;
}

export interface RepoCost {
  readonly repo: string | null;
  readonly usd: number;
}

export interface DailyCost {
  readonly day: string;
  readonly usd: number;
}

export interface PromptWait {
  readonly missionId: string;
  readonly title: string;
  readonly toolName: string | null;
  readonly seconds: number;
}

export interface StatsReport {
  readonly totalCostUsd: number;
  /** Largest spender first. */
  readonly costByMission: readonly MissionCost[];
  /** Largest spender first. */
  readonly costByRepo: readonly RepoCost[];
  /** Chronological — there are only ever a couple of days of these. */
  readonly costByDay: readonly DailyCost[];
  /** Longest wait first: that is the number worth noticing. */
  readonly waits: readonly PromptWait[];
}

interface MissionInfo {
  readonly title: string;
  readonly repo: string | null;
}

function missionInfoById(db: Db): Map<string, MissionInfo> {
  return new Map(
    db
      .select({ id: missions.id, title: missions.title, repo: missions.repo })
      .from(missions)
      .all()
      .map((row) => [row.id, { title: row.title, repo: row.repo }]),
  );
}

// A malformed or missing field costs nothing rather than throwing: one bad
// event must not take the whole screen down with it.
function costOf(payloadJson: string): number {
  const parsed = resultPayloadSchema.safeParse(JSON.parse(payloadJson));
  return parsed.success ? parsed.data.total_cost_usd : 0;
}

function addCost(byKey: Map<string, number>, key: string, usd: number): void {
  byKey.set(key, (byKey.get(key) ?? 0) + usd);
}

function costTotals(db: Db, missionInfo: Map<string, MissionInfo>) {
  const byMission = new Map<string, number>();
  const byRepo = new Map<string, number>();
  const byDay = new Map<string, number>();
  let totalCostUsd = 0;

  const resultRows = db
    .select({
      missionId: events.missionId,
      ts: events.ts,
      payloadJson: events.payloadJson,
    })
    .from(events)
    .where(eq(events.type, RESULT_EVENT_TYPE))
    .all();

  for (const row of resultRows) {
    const mission = missionInfo.get(row.missionId);
    if (!mission) continue;

    const usd = costOf(row.payloadJson);
    totalCostUsd += usd;
    addCost(byMission, row.missionId, usd);
    addCost(byRepo, mission.repo ?? NULL_REPO_KEY, usd);
    addCost(byDay, row.ts.slice(0, 10), usd);
  }

  return { totalCostUsd, byMission, byRepo, byDay };
}

// A Map key has to be a string, but a repo's absence is meant to stay `null`
// in the report — this stands in for that key and is swapped back on the way out.
const NULL_REPO_KEY = "\0no-repo";

function waitsFor(db: Db, missionInfo: Map<string, MissionInfo>): PromptWait[] {
  const promptRows = db
    .select({
      missionId: pendingPrompts.missionId,
      toolName: pendingPrompts.toolName,
      createdAt: pendingPrompts.createdAt,
      answeredAt: pendingPrompts.answeredAt,
    })
    .from(pendingPrompts)
    .all();

  return promptRows
    .flatMap((row) => {
      const mission = missionInfo.get(row.missionId);
      if (!mission || row.answeredAt === null) return [];

      const seconds = (Date.parse(row.answeredAt) - Date.parse(row.createdAt)) / 1000;
      return [
        {
          missionId: row.missionId,
          title: mission.title,
          toolName: row.toolName,
          seconds,
        },
      ];
    })
    .sort((a, b) => b.seconds - a.seconds);
}

export function getStats(db: Db): StatsReport {
  const missionInfo = missionInfoById(db);
  const { totalCostUsd, byMission, byRepo, byDay } = costTotals(db, missionInfo);

  const costByMission = [...byMission.entries()]
    .map(([missionId, usd]) => {
      const mission = missionInfo.get(missionId);
      return { missionId, title: mission ? mission.title : missionId, usd };
    })
    .sort((a, b) => b.usd - a.usd);

  const costByRepo = [...byRepo.entries()]
    .map(([repo, usd]) => ({ repo: repo === NULL_REPO_KEY ? null : repo, usd }))
    .sort((a, b) => b.usd - a.usd);

  const costByDay = [...byDay.entries()]
    .map(([day, usd]) => ({ day, usd }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    totalCostUsd,
    costByMission,
    costByRepo,
    costByDay,
    waits: waitsFor(db, missionInfo),
  };
}
