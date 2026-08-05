import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import { appendEvent, createMission, recordPrompt } from "./missions";
import { events, pendingPrompts } from "./schema";
import { getStats } from "./stats";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-stats-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function newMission(overrides: Partial<Parameters<typeof createMission>[1]> = {}) {
  return createMission(db, {
    title: "Fix the login bug",
    source: "free",
    prompt: "fix it",
    ...overrides,
  });
}

// Starts well past what createMission's own "mission.created" event already
// claimed, so a direct insert never collides with a real appendEvent seq.
const nextSeq = new Map<string, number>();

function recordResult(missionId: string, totalCostUsd: number, ts?: string) {
  if (ts === undefined) {
    appendEvent(db, missionId, "agent.result", { total_cost_usd: totalCostUsd });
    return;
  }
  // Inserted directly so the event's day can be controlled for bucketing tests
  // — appendEvent always stamps "now".
  const seq = (nextSeq.get(missionId) ?? 100) + 1;
  nextSeq.set(missionId, seq);
  db.insert(events)
    .values({
      missionId,
      seq,
      ts,
      type: "agent.result",
      payloadJson: JSON.stringify({ total_cost_usd: totalCostUsd }),
    })
    .run();
}

function recordAnsweredPrompt(
  missionId: string,
  toolName: string,
  createdAt: string,
  answeredAt: string,
) {
  const prompt = recordPrompt(db, {
    missionId,
    kind: "tool_approval",
    toolName,
    input: {},
  });
  db.update(pendingPrompts)
    .set({ createdAt, answeredAt })
    .where(eq(pendingPrompts.id, prompt.id))
    .run();
}

describe("getStats", () => {
  it("reports zeros with no data", () => {
    const report = getStats(db);
    expect(report).toEqual({
      totalCostUsd: 0,
      costByMission: [],
      costByRepo: [],
      costByDay: [],
      waits: [],
    });
  });

  it("sums cost across every agent.result event for a mission", () => {
    const mission = newMission();
    recordResult(mission.id, 0.5);
    recordResult(mission.id, 1.25);

    const report = getStats(db);
    expect(report.totalCostUsd).toBeCloseTo(1.75);
    expect(report.costByMission).toEqual([
      { missionId: mission.id, title: mission.title, usd: expect.closeTo(1.75, 5) },
    ]);
  });

  it("keeps missions separate, largest cost first", () => {
    const cheap = newMission({ title: "Cheap" });
    const pricey = newMission({ title: "Pricey" });
    recordResult(cheap.id, 0.1);
    recordResult(pricey.id, 5);

    const report = getStats(db);
    expect(report.costByMission.map((m) => m.title)).toEqual(["Pricey", "Cheap"]);
  });

  it("treats a result payload with no total_cost_usd as zero rather than throwing", () => {
    const mission = newMission();
    appendEvent(db, mission.id, "agent.result", { is_error: true });

    expect(() => getStats(db)).not.toThrow();
    expect(getStats(db).totalCostUsd).toBe(0);
  });

  it("groups cost by repository, missions with no repo grouped under null", () => {
    const withRepo = newMission({ repo: "acme/widgets" });
    const withoutRepo = newMission();
    recordResult(withRepo.id, 2);
    recordResult(withoutRepo.id, 1);

    const report = getStats(db);
    expect(report.costByRepo).toEqual([
      { repo: "acme/widgets", usd: expect.closeTo(2, 5) },
      { repo: null, usd: expect.closeTo(1, 5) },
    ]);
  });

  it("groups cost by the calendar day the result event landed on", () => {
    const mission = newMission();
    recordResult(mission.id, 1, "2026-08-01T10:00:00.000Z");
    recordResult(mission.id, 2, "2026-08-02T10:00:00.000Z");
    recordResult(mission.id, 3, "2026-08-01T22:00:00.000Z");

    const report = getStats(db);
    expect(report.costByDay).toEqual([
      { day: "2026-08-01", usd: expect.closeTo(4, 5) },
      { day: "2026-08-02", usd: expect.closeTo(2, 5) },
    ]);
  });

  it("measures how long an answered prompt sat waiting on the operator", () => {
    const mission = newMission();
    recordAnsweredPrompt(
      mission.id,
      "Bash",
      "2026-08-01T10:00:00.000Z",
      "2026-08-01T10:02:30.000Z",
    );

    const report = getStats(db);
    expect(report.waits).toEqual([
      { missionId: mission.id, title: mission.title, toolName: "Bash", seconds: 150 },
    ]);
  });

  it("excludes prompts nobody has answered yet", () => {
    const mission = newMission();
    recordPrompt(db, {
      missionId: mission.id,
      kind: "tool_approval",
      toolName: "Bash",
      input: {},
    });

    expect(getStats(db).waits).toEqual([]);
  });

  it("sorts waits longest first", () => {
    const mission = newMission();
    recordAnsweredPrompt(
      mission.id,
      "Read",
      "2026-08-01T10:00:00.000Z",
      "2026-08-01T10:00:05.000Z",
    );
    recordAnsweredPrompt(
      mission.id,
      "Bash",
      "2026-08-01T11:00:00.000Z",
      "2026-08-01T11:10:00.000Z",
    );

    const report = getStats(db);
    expect(report.waits.map((w) => w.toolName)).toEqual(["Bash", "Read"]);
  });
});
