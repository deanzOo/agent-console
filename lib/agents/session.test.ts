import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { openDatabase, type Db } from "../db";
import { createMission, getMission, listEvents, openPrompts } from "../missions";
import { MissionSession, type AgentDriver, type AgentRun } from "./session";

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-session-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

type CanUseTool = Parameters<AgentDriver["start"]>[0]["canUseTool"];

/** A driver whose message stream and tool calls the test drives by hand. */
function fakeDriver() {
  const queue: SDKMessage[] = [];
  let push: (() => void) | undefined;
  let done = false;
  let failure: Error | undefined;
  let canUseTool: CanUseTool | undefined;
  let interrupted = false;

  const run: AgentRun = {
    messages: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (queue.length > 0) {
            const next = queue.shift();
            if (next) yield next;
          }
          if (failure) throw failure;
          if (done) return;
          await new Promise<void>((resolve) => {
            push = resolve;
          });
        }
      },
    },
    interrupt: async () => {
      interrupted = true;
    },
    close: () => {
      done = true;
      push?.();
    },
  };

  const wake = () => {
    const resume = push;
    push = undefined;
    resume?.();
  };

  return {
    driver: {
      start(options) {
        canUseTool = options.canUseTool;
        return run;
      },
    } satisfies AgentDriver,
    emit(message: SDKMessage) {
      queue.push(message);
      wake();
    },
    finish() {
      done = true;
      wake();
    },
    fail(error: Error) {
      failure = error;
      wake();
    },
    requestTool(name: string, input: Record<string, unknown> = {}) {
      if (!canUseTool) throw new Error("session not started");
      return canUseTool(name, input, { signal: new AbortController().signal });
    },
    get interrupted() {
      return interrupted;
    },
  };
}

function textMessage(text: string): SDKMessage {
  // The SDK's union is wider than this test needs; only `type` is read.
  return JSON.parse(JSON.stringify({ type: "assistant", text }));
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function start(fake: ReturnType<typeof fakeDriver>) {
  const mission = createMission(db, { title: "t", source: "free", prompt: "do it" });
  const session = new MissionSession(db, mission.id);
  session.start(fake.driver, {
    missionId: mission.id,
    prompt: "do it",
    cwd: dir,
  });
  return { mission, session };
}

describe("MissionSession", () => {
  it("marks the mission running once started", async () => {
    const fake = fakeDriver();
    const { mission } = start(fake);
    await settle();
    expect(getMission(db, mission.id)?.status).toBe("running");
  });

  it("refuses to start twice", () => {
    const fake = fakeDriver();
    const { session, mission } = start(fake);
    expect(() =>
      session.start(fake.driver, { missionId: mission.id, prompt: "again", cwd: dir }),
    ).toThrowError(/already started/);
  });

  it("appends every agent message to the transcript", async () => {
    const fake = fakeDriver();
    const { mission } = start(fake);
    fake.emit(textMessage("working"));
    await settle();

    const types = listEvents(db, mission.id, 0).map((event) => event.type);
    expect(types).toContain("agent.assistant");
  });

  it("notifies subscribers as events land", async () => {
    const fake = fakeDriver();
    const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
    const session = new MissionSession(db, mission.id);
    const seen: string[] = [];
    session.subscribe((event) => seen.push(event.type));

    session.start(fake.driver, { missionId: mission.id, prompt: "p", cwd: dir });
    fake.emit(textMessage("hi"));
    await settle();

    expect(seen).toContain("agent.assistant");
  });

  it("stops notifying after unsubscribe", async () => {
    const fake = fakeDriver();
    const mission = createMission(db, { title: "t", source: "free", prompt: "p" });
    const session = new MissionSession(db, mission.id);
    const seen: string[] = [];
    const unsubscribe = session.subscribe((event) => seen.push(event.type));
    unsubscribe();

    session.start(fake.driver, { missionId: mission.id, prompt: "p", cwd: dir });
    await settle();
    expect(seen).toEqual([]);
  });

  it("captures the session id so the mission can be resumed", async () => {
    const fake = fakeDriver();
    const { mission } = start(fake);
    fake.emit(JSON.parse(JSON.stringify({ type: "system", session_id: "sess-9" })));
    await settle();
    expect(getMission(db, mission.id)?.sessionId).toBe("sess-9");
  });

  it("finishes as done when the stream ends", async () => {
    const fake = fakeDriver();
    const { mission } = start(fake);
    fake.finish();
    await settle();
    expect(getMission(db, mission.id)?.status).toBe("done");
  });

  it("finishes as failed when the stream throws, recording why", async () => {
    const fake = fakeDriver();
    const { mission } = start(fake);
    fake.fail(new Error("model unreachable"));
    await settle();

    expect(getMission(db, mission.id)?.status).toBe("failed");
    const last = listEvents(db, mission.id, 0).at(-1);
    expect(last?.payload).toMatchObject({ error: "model unreachable" });
  });

  describe("permission requests", () => {
    it("blocks the agent and marks the mission awaiting input", async () => {
      const fake = fakeDriver();
      const { mission } = start(fake);

      let settled = false;
      void fake.requestTool("Bash", { command: "ls" }).then(() => {
        settled = true;
      });
      await settle();

      expect(getMission(db, mission.id)?.status).toBe("awaiting_input");
      expect(settled).toBe(false);
    });

    it("records what was asked so the UI can render it", async () => {
      const fake = fakeDriver();
      const { mission } = start(fake);
      void fake.requestTool("Bash", { command: "rm -rf build" });
      await settle();

      const [prompt] = openPrompts(db, mission.id);
      expect(prompt).toMatchObject({ toolName: "Bash", kind: "tool_approval" });
      expect(prompt?.input).toEqual({ command: "rm -rf build" });
    });

    it("releases the agent when answered, and resumes running", async () => {
      const fake = fakeDriver();
      const { mission, session } = start(fake);
      const decision = fake.requestTool("Bash");
      await settle();

      const [prompt] = openPrompts(db, mission.id);
      expect(session.answer(prompt?.id ?? "", { behavior: "allow" })).toBe(true);

      await expect(decision).resolves.toEqual({ behavior: "allow" });
      expect(getMission(db, mission.id)?.status).toBe("running");
    });

    it("passes a denial and its reason back to the agent", async () => {
      const fake = fakeDriver();
      const { mission, session } = start(fake);
      const decision = fake.requestTool("Bash");
      await settle();

      const [prompt] = openPrompts(db, mission.id);
      session.answer(prompt?.id ?? "", {
        behavior: "deny",
        message: "use the test db",
      });

      await expect(decision).resolves.toMatchObject({ message: "use the test db" });
    });

    it("reports an answer to an unknown prompt as unhandled", () => {
      const fake = fakeDriver();
      const { session } = start(fake);
      expect(session.answer("nope", { behavior: "allow" })).toBe(false);
    });

    it("denies anything outstanding when interrupted", async () => {
      const fake = fakeDriver();
      const { session } = start(fake);
      const decision = fake.requestTool("Bash");
      await settle();

      await session.interrupt();

      await expect(decision).resolves.toMatchObject({ behavior: "deny" });
      expect(fake.interrupted).toBe(true);
    });

    it("denies anything outstanding when the session stops", async () => {
      const fake = fakeDriver();
      const { session } = start(fake);
      const decision = fake.requestTool("Bash");
      await settle();

      await session.stop();
      await expect(decision).resolves.toMatchObject({ behavior: "deny" });
    });
  });
});
