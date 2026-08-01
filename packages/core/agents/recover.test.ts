import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "../db";
import {
  appendEvent,
  archiveMission,
  createMission,
  recordWorkspace,
  setSessionId,
  setStatus,
} from "../missions";
import { MISSION_STATUS } from "../schema";
import { MAX_RESUME_ATTEMPTS, MAX_RESUMED_PER_BOOT, planRecovery } from "./recover";

let dir: string;
let db: Db;

const alwaysExists = () => true;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "recover-"));
  db = openDatabase(path.join(dir, "data.db"), path.join(process.cwd(), "drizzle"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

function interrupted(options: { session?: string | undefined; tree?: string } = {}) {
  const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
  setStatus(db, mission.id, MISSION_STATUS.RUNNING);
  if (options.session !== undefined) setSessionId(db, mission.id, options.session);
  if (options.tree) {
    recordWorkspace(db, mission.id, { branch: "b", worktreePath: options.tree });
  }
  return mission.id;
}

describe("planRecovery", () => {
  it("brings back a mission that has a session to resume", () => {
    const id = interrupted({ session: "s1" });

    const plan = planRecovery(db, alwaysExists);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ action: "resume" });
    expect(plan[0]?.mission.id).toBe(id);
  });

  // It never got far enough to have anything to resume.
  it("stops one that never had a session", () => {
    interrupted();
    expect(planRecovery(db, alwaysExists)[0]).toMatchObject({
      action: "stop",
      reason: "no session to resume",
    });
  });

  // Resuming into a directory that is gone fails in a way that reads as a bug
  // rather than as the tidy-up it actually was.
  it("stops one whose working tree was discarded", () => {
    interrupted({ session: "s1", tree: "/gone" });

    const plan = planRecovery(db, () => false);

    expect(plan[0]).toMatchObject({ action: "stop" });
    expect(plan[0]?.action === "stop" && plan[0].reason).toContain("working tree");
  });

  // If resuming is what kills the process, it resumes again on the next boot,
  // and again. The count comes from the transcript because that survives.
  it("gives up after too many attempts", () => {
    const id = interrupted({ session: "s1" });
    for (let i = 0; i < MAX_RESUME_ATTEMPTS; i += 1) {
      appendEvent(db, id, "mission.resumed", {});
    }

    expect(planRecovery(db, alwaysExists)[0]).toMatchObject({ action: "stop" });
  });

  it("still resumes one that has been resumed fewer times than that", () => {
    const id = interrupted({ session: "s1" });
    appendEvent(db, id, "mission.resumed", {});

    expect(planRecovery(db, alwaysExists)[0]).toMatchObject({ action: "resume" });
  });

  // Each resume replays context and costs tokens, so a boot after a long
  // outage should not silently spend a fortune.
  it("caps how many come back at once", () => {
    for (let i = 0; i < MAX_RESUMED_PER_BOOT + 2; i += 1) {
      interrupted({ session: `s${i}` });
    }

    const plan = planRecovery(db, alwaysExists);

    expect(plan.filter((entry) => entry.action === "resume")).toHaveLength(
      MAX_RESUMED_PER_BOOT,
    );
    expect(plan.filter((entry) => entry.action === "stop")).toHaveLength(2);
  });

  it("ignores missions that already finished", () => {
    const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    expect(planRecovery(db, alwaysExists)).toHaveLength(0);
  });

  it("ignores archived missions", () => {
    const id = interrupted({ session: "s1" });
    archiveMission(db, id);

    expect(planRecovery(db, alwaysExists)).toHaveLength(0);
  });
});
