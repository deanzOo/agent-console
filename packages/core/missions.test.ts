import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, type Db } from "./db";
import { MISSION_STATUS } from "./schema";
import {
  answerPrompt,
  appendEvent,
  countAwaitingInput,
  archiveMission,
  createMission,
  getMission,
  listEvents,
  recordWorkspace,
  restoreMission,
  listMissions,
  openPrompts,
  recordPrompt,
  setSessionId,
  setStatus,
} from "./missions";

let dir: string;
let db: Db;

function newMission(overrides: Partial<Parameters<typeof createMission>[1]> = {}) {
  return createMission(db, {
    title: "Fix the login bug",
    source: "free",
    prompt: "fix it",
    ...overrides,
  });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-missions-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("createMission", () => {
  it("starts in the starting state", () => {
    expect(newMission().status).toBe("starting");
  });

  it("gives every mission a distinct id", () => {
    expect(newMission().id).not.toBe(newMission().id);
  });

  it("is retrievable afterwards", () => {
    const created = newMission();
    expect(getMission(db, created.id)?.title).toBe("Fix the login bug");
  });

  it("keeps the source reference for issue-driven work", () => {
    const created = newMission({ source: "github", sourceRef: "owner/repo#12" });
    expect(getMission(db, created.id)?.sourceRef).toBe("owner/repo#12");
  });

  it("returns undefined for an unknown mission", () => {
    expect(getMission(db, "nope")).toBeUndefined();
  });
});

describe("recordWorkspace", () => {
  // The row is created before the worktree exists, so without this the mission
  // never records which branch it worked on or which tree to clean up.
  it("stores the branch and worktree once they exist", () => {
    const m = createMission(db, { title: "t", source: "github", prompt: "p" });
    expect(m.branch).toBeNull();

    recordWorkspace(db, m.id, {
      branch: "agent/thing-abc",
      worktreePath: "/workspace/wt/abc",
    });

    const found = getMission(db, m.id);
    expect(found?.branch).toBe("agent/thing-abc");
    expect(found?.worktreePath).toBe("/workspace/wt/abc");
  });
});

describe("archiving", () => {
  it("hides an archived mission from the default list", () => {
    const m = createMission(db, { title: "Old", source: "free", prompt: "p" });
    archiveMission(db, m.id);

    expect(listMissions(db)).toHaveLength(0);
    expect(listMissions(db, { archived: true }).map((x) => x.id)).toEqual([m.id]);
  });

  it("records when it was archived rather than a flag", () => {
    const m = createMission(db, { title: "Old", source: "free", prompt: "p" });
    archiveMission(db, m.id);

    const [found] = listMissions(db, { archived: true });
    expect(found?.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("restores an archived mission", () => {
    const m = createMission(db, { title: "Old", source: "free", prompt: "p" });
    archiveMission(db, m.id);
    restoreMission(db, m.id);

    expect(listMissions(db).map((x) => x.id)).toEqual([m.id]);
  });

  // Nothing is destroyed: the transcript is the record of what an agent did.
  it("keeps the transcript and the mission row", () => {
    const m = createMission(db, { title: "Old", source: "free", prompt: "p" });
    appendEvent(db, m.id, "agent.assistant", { text: "hello" });
    archiveMission(db, m.id);

    expect(getMission(db, m.id)).toBeDefined();
    expect(listEvents(db, m.id, 0)).toHaveLength(2);
  });

  it("leaves a live mission out of the archived view", () => {
    createMission(db, { title: "Live", source: "free", prompt: "p" });
    expect(listMissions(db, { archived: true })).toHaveLength(0);
  });

  it("does not count an archived mission as awaiting input", () => {
    const m = createMission(db, { title: "Old", source: "free", prompt: "p" });
    setStatus(db, m.id, MISSION_STATUS.AWAITING_INPUT);
    expect(countAwaitingInput(db)).toBe(1);

    archiveMission(db, m.id);
    expect(countAwaitingInput(db)).toBe(0);
  });
});

describe("listMissions filtering", () => {
  function seed(db: Db) {
    const a = createMission(db, {
      title: "Fix the login bug",
      source: "free",
      prompt: "p",
    });
    const b = createMission(db, {
      title: "Add SEARCH to issues",
      source: "free",
      prompt: "p",
    });
    setStatus(db, b.id, MISSION_STATUS.AWAITING_INPUT);
    return { a, b };
  }

  it("returns everything when nothing is asked for", () => {
    seed(db);
    expect(listMissions(db)).toHaveLength(2);
  });

  it("narrows to one status", () => {
    const { b } = seed(db);
    const found = listMissions(db, { status: MISSION_STATUS.AWAITING_INPUT });
    expect(found.map((m) => m.id)).toEqual([b.id]);
  });

  it("searches titles without regard to case", () => {
    const { b } = seed(db);
    expect(listMissions(db, { query: "search" }).map((m) => m.id)).toEqual([b.id]);
  });

  it("treats LIKE wildcards as literal characters", () => {
    seed(db);
    expect(listMissions(db, { query: "%" })).toHaveLength(0);
  });

  it("ignores a blank query", () => {
    seed(db);
    expect(listMissions(db, { query: "  " })).toHaveLength(2);
  });
});

describe("listMissions", () => {
  it("is empty on a fresh install", () => {
    expect(listMissions(db)).toEqual([]);
  });

  it("returns newest first", () => {
    const first = newMission({ title: "first" });
    const second = newMission({ title: "second" });
    const ids = listMissions(db).map((mission) => mission.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });
});

describe("appendEvent", () => {
  it("opens the transcript with the request, so it is never lost", () => {
    const mission = newMission({ prompt: "fix it" });
    const [first] = listEvents(db, mission.id, 0);
    expect(first).toMatchObject({ seq: 1, type: "mission.created" });
    expect(first?.payload).toEqual({ prompt: "fix it" });
  });

  it("increments the sequence per mission", () => {
    const mission = newMission();
    expect(appendEvent(db, mission.id, "text", {}).seq).toBe(2);
    expect(appendEvent(db, mission.id, "text", {}).seq).toBe(3);
  });

  it("numbers each mission independently", () => {
    const a = newMission();
    const b = newMission();
    appendEvent(db, a.id, "text", {});
    appendEvent(db, a.id, "text", {});
    expect(appendEvent(db, b.id, "text", {}).seq).toBe(2);
  });

  it("records the sequence on the mission so it survives a restart", () => {
    const mission = newMission();
    appendEvent(db, mission.id, "text", {});
    expect(getMission(db, mission.id)?.lastSeq).toBe(2);
  });

  it("rejects an event for a mission that does not exist", () => {
    expect(() => appendEvent(db, "nope", "text", {})).toThrowError(/No such mission/);
  });

  it("round-trips the payload", () => {
    const mission = newMission();
    appendEvent(db, mission.id, "tool_use", { name: "Bash", nested: { n: 1 } });
    expect(listEvents(db, mission.id, 1)[0]?.payload).toEqual({
      name: "Bash",
      nested: { n: 1 },
    });
  });
});

describe("listEvents", () => {
  it("returns everything after the given cursor", () => {
    const mission = newMission();
    appendEvent(db, mission.id, "text", { n: 1 });
    appendEvent(db, mission.id, "text", { n: 2 });
    appendEvent(db, mission.id, "text", { n: 3 });

    expect(listEvents(db, mission.id, 2).map((event) => event.seq)).toEqual([3, 4]);
  });

  it("returns nothing when the caller is already up to date", () => {
    const mission = newMission();
    const last = appendEvent(db, mission.id, "text", {});
    expect(listEvents(db, mission.id, last.seq)).toEqual([]);
  });

  it("does not leak events across missions", () => {
    const a = newMission();
    const b = newMission();
    appendEvent(db, a.id, "text", { mine: false });
    const seqs = listEvents(db, b.id, 0).map((event) => event.type);
    expect(seqs).toEqual(["mission.created"]);
  });
});

describe("status", () => {
  it("updates", () => {
    const mission = newMission();
    setStatus(db, mission.id, "running");
    expect(getMission(db, mission.id)?.status).toBe("running");
  });

  it("counts only missions blocked on a human", () => {
    const waiting = newMission();
    const running = newMission();
    setStatus(db, waiting.id, "awaiting_input");
    setStatus(db, running.id, "running");
    expect(countAwaitingInput(db)).toBe(1);
  });

  it("stores the session id for resume", () => {
    const mission = newMission();
    setSessionId(db, mission.id, "sess-1");
    expect(getMission(db, mission.id)?.sessionId).toBe("sess-1");
  });
});

describe("prompts", () => {
  it("records a prompt as open", () => {
    const mission = newMission();
    const prompt = recordPrompt(db, {
      missionId: mission.id,
      kind: "tool_approval",
      toolName: "Bash",
      input: { command: "ls" },
    });
    expect(openPrompts(db, mission.id).map((p) => p.id)).toEqual([prompt.id]);
  });

  it("stops listing a prompt once answered", () => {
    const mission = newMission();
    const prompt = recordPrompt(db, {
      missionId: mission.id,
      kind: "tool_approval",
      toolName: "Bash",
      input: {},
    });
    answerPrompt(db, prompt.id);
    expect(openPrompts(db, mission.id)).toEqual([]);
  });

  it("keeps the tool input so the UI can show what was asked", () => {
    const mission = newMission();
    recordPrompt(db, {
      missionId: mission.id,
      kind: "tool_approval",
      toolName: "Bash",
      input: { command: "rm -rf build" },
    });
    expect(openPrompts(db, mission.id)[0]?.input).toEqual({ command: "rm -rf build" });
  });
});
