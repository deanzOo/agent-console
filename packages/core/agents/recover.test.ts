import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "../db";
import {
  appendEvent,
  archiveMission,
  createMission,
  getMission,
  recordWorkspace,
  setSessionId,
  setStatus,
} from "../missions";
import { MISSION_STATUS } from "../schema";
import { canResumeManually, MAX_RESUME_ATTEMPTS, planRecovery } from "./recover";

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

function stopped(options: { session?: string | undefined; tree?: string } = {}) {
  const id = interrupted(options);
  setStatus(db, id, MISSION_STATUS.STOPPED);
  const mission = getMission(db, id);
  if (!mission) throw new Error("mission vanished");
  return mission;
}

describe("planRecovery", () => {
  it("brings back a mission that has a session to resume", () => {
    const id = interrupted({ session: "s1" });

    const plan = planRecovery(db, 5, alwaysExists);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ action: "resume" });
    expect(plan[0]?.mission.id).toBe(id);
  });

  // It never got far enough to have anything to resume.
  it("stops one that never had a session", () => {
    interrupted();
    expect(planRecovery(db, 5, alwaysExists)[0]).toMatchObject({
      action: "stop",
      reason: "no session to resume",
    });
  });

  // Resuming into a directory that is gone fails in a way that reads as a bug
  // rather than as the tidy-up it actually was.
  it("stops one whose working tree was discarded", () => {
    interrupted({ session: "s1", tree: "/gone" });

    const plan = planRecovery(db, 5, () => false);

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

    expect(planRecovery(db, 5, alwaysExists)[0]).toMatchObject({ action: "stop" });
  });

  it("still resumes one that has been resumed fewer times than that", () => {
    const id = interrupted({ session: "s1" });
    appendEvent(db, id, "mission.resumed", {});

    expect(planRecovery(db, 5, alwaysExists)[0]).toMatchObject({ action: "resume" });
  });

  // A resumed mission is an agent like any other. Bringing back more than the
  // box was told to run is how a restart recreated the pile-up the cap exists
  // to prevent.
  it("brings back no more than the concurrency cap allows", () => {
    for (let i = 0; i < 5; i += 1) interrupted({ session: `s${i}` });

    const plan = planRecovery(db, 2, alwaysExists);

    expect(plan.filter((entry) => entry.action === "resume")).toHaveLength(2);
  });

  // Waiting is not the same as being abandoned. The work is still there, and a
  // slot will free.
  it("queues the rest rather than stopping them", () => {
    for (let i = 0; i < 5; i += 1) interrupted({ session: `s${i}` });

    const plan = planRecovery(db, 2, alwaysExists);

    expect(plan.filter((entry) => entry.action === "queue")).toHaveLength(3);
    expect(plan.filter((entry) => entry.action === "stop")).toHaveLength(0);
  });

  // The ones that cannot come back at all are still stopped, and still say why.
  it("still stops what it cannot resume, whatever the cap", () => {
    interrupted();

    expect(planRecovery(db, 5, alwaysExists)[0]).toMatchObject({
      action: "stop",
      reason: "no session to resume",
    });
  });

  it("ignores missions that already finished", () => {
    const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
    setStatus(db, mission.id, MISSION_STATUS.DONE);

    expect(planRecovery(db, 5, alwaysExists)).toHaveLength(0);
  });

  it("ignores archived missions", () => {
    const id = interrupted({ session: "s1" });
    archiveMission(db, id);

    expect(planRecovery(db, 5, alwaysExists)).toHaveLength(0);
  });
});

describe("canResumeManually", () => {
  it("allows a stopped mission with a session and a working tree", () => {
    const mission = stopped({ session: "s1", tree: "/tree" });

    expect(canResumeManually(mission, alwaysExists)).toEqual({ ok: true });
  });

  it("allows a stopped mission with a session and no working tree at all", () => {
    const mission = stopped({ session: "s1" });

    expect(canResumeManually(mission, alwaysExists)).toEqual({ ok: true });
  });

  it("refuses a mission that is not stopped", () => {
    const id = interrupted({ session: "s1" });
    const mission = getMission(db, id);
    if (!mission) throw new Error("mission vanished");

    expect(canResumeManually(mission, alwaysExists)).toEqual({
      ok: false,
      reason: "only a stopped mission can be resumed",
    });
  });

  it("refuses one that never had a session", () => {
    const mission = stopped();

    expect(canResumeManually(mission, alwaysExists)).toEqual({
      ok: false,
      reason: "it never had a session to resume",
    });
  });

  it("refuses one whose working tree is gone", () => {
    const mission = stopped({ session: "s1", tree: "/gone" });

    expect(canResumeManually(mission, () => false)).toEqual({
      ok: false,
      reason: "its working tree is gone",
    });
  });

  // The attempt counter exists to stop a boot loop from resuming the same
  // mission forever on its own. An operator asking for it once by hand is a
  // different signal and must not be blocked by the same counter.
  it("does not count previous resume attempts against a manual request", () => {
    const mission = stopped({ session: "s1" });
    for (let i = 0; i < MAX_RESUME_ATTEMPTS + 5; i += 1) {
      appendEvent(db, mission.id, "mission.resumed", {});
    }

    expect(canResumeManually(mission, alwaysExists)).toEqual({ ok: true });
  });
});
