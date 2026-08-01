import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "../db";
import {
  archiveMission,
  createMission,
  getMission,
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
  recordPrompt(db, {
    missionId: created.id,
    kind: PROMPT_KIND.TOOL_APPROVAL,
    input: {},
  });
  return created.id;
}

describe("reconcileOrphans", () => {
  // Seen on the deployment: a mission finished with an approval still open, so
  // the console kept offering a decision that answered session_not_running.
  it.each([MISSION_STATUS.DONE, MISSION_STATUS.FAILED, MISSION_STATUS.STOPPED])(
    "closes prompts left open on a mission that is %s",
    (status) => {
      const id = mission(status);

      reconcileOrphans(db);

      expect(openPrompts(db, id)).toHaveLength(0);
      expect(getMission(db, id)?.status).toBe(status);
    },
  );

  // Whether a live mission comes back is recovery's decision, and it closes
  // their prompts itself when it gives up on one. Closing them here would
  // quietly answer an approval a resumed agent is still waiting on.
  it.each([
    MISSION_STATUS.STARTING,
    MISSION_STATUS.RUNNING,
    MISSION_STATUS.AWAITING_INPUT,
  ])("leaves a %s mission and its prompts alone", (status) => {
    const id = mission(status);

    reconcileOrphans(db);

    expect(openPrompts(db, id)).toHaveLength(1);
    expect(getMission(db, id)?.status).toBe(status);
  });

  it("ignores archived missions", () => {
    const id = mission(MISSION_STATUS.DONE);
    archiveMission(db, id);

    reconcileOrphans(db);

    expect(openPrompts(db, id)).toHaveLength(1);
  });

  it("is safe to run when there is nothing to do", () => {
    expect(reconcileOrphans(db)).toBe(0);
  });
});
