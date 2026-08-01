import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "../db";
import {
  archiveMission,
  createMission,
  getMission,
  listEvents,
  openPrompts,
  recordPrompt,
  setStatus,
} from "../missions";
import { MISSION_STATUS, PROMPT_KIND } from "../schema";
import { reconcileOrphans } from "./orphans";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "orphans-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function mission(status: (typeof MISSION_STATUS)[keyof typeof MISSION_STATUS]) {
  const created = createMission(db, { title: "t", source: "free", prompt: "p" });
  setStatus(db, created.id, status);
  return created.id;
}

describe("reconcileOrphans", () => {
  it.each([
    MISSION_STATUS.STARTING,
    MISSION_STATUS.RUNNING,
    MISSION_STATUS.AWAITING_INPUT,
  ])("stops a mission left %s by a restart", (status) => {
    const id = mission(status);

    expect(reconcileOrphans(db)).toBe(1);
    expect(getMission(db, id)?.status).toBe(MISSION_STATUS.STOPPED);
  });

  // The console offered these and answering returned session_not_running, which
  // left the operator unable to advance or dismiss the mission.
  it("closes prompts nobody can answer any more", () => {
    const id = mission(MISSION_STATUS.AWAITING_INPUT);
    recordPrompt(db, { missionId: id, kind: PROMPT_KIND.TOOL_APPROVAL, input: {} });
    recordPrompt(db, { missionId: id, kind: PROMPT_KIND.TOOL_APPROVAL, input: {} });
    expect(openPrompts(db, id)).toHaveLength(2);

    reconcileOrphans(db);

    expect(openPrompts(db, id)).toHaveLength(0);
  });

  it("says in the transcript why the mission ended", () => {
    const id = mission(MISSION_STATUS.RUNNING);
    reconcileOrphans(db);

    const last = listEvents(db, id, 0).at(-1);
    expect(JSON.stringify(last?.payload)).toContain("session host restarted");
  });

  it.each([MISSION_STATUS.DONE, MISSION_STATUS.FAILED, MISSION_STATUS.STOPPED])(
    "leaves a mission that had already finished as %s",
    (status) => {
      const id = mission(status);

      expect(reconcileOrphans(db)).toBe(0);
      expect(getMission(db, id)?.status).toBe(status);
    },
  );

  it("ignores an archived mission", () => {
    const id = mission(MISSION_STATUS.AWAITING_INPUT);
    archiveMission(db, id);

    expect(reconcileOrphans(db)).toBe(0);
  });

  it("is safe to run when there is nothing to do", () => {
    expect(reconcileOrphans(db)).toBe(0);
  });
});
