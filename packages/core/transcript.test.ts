import { describe, expect, it } from "vitest";
import { summarise, toTranscript } from "./transcript";

function event(type: string, payload: unknown) {
  return { seq: 1, ts: "2026-07-31T00:00:00.000Z", type, payload };
}

describe("summarise", () => {
  it("reads what the agent said", () => {
    const entry = summarise(
      event("agent.assistant", {
        message: { content: [{ type: "text", text: "Found the bug." }] },
      }),
    );
    expect(entry).toEqual({ kind: "said", who: "agent", text: "Found the bug." });
  });

  // The command is what the operator is approving, so it is what they see.
  it("leads with the command a tool call will run", () => {
    const entry = summarise(
      event("agent.assistant", {
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "npm test", description: "Run the tests" },
            },
          ],
        },
      }),
    );
    expect(entry).toEqual({ kind: "tool", name: "Bash", summary: "npm test" });
  });

  it("falls back through path, pattern and description", () => {
    const summaryOf = (input: unknown) => {
      const entry = summarise(
        event("agent.assistant", {
          message: { content: [{ type: "tool_use", name: "Read", input }] },
        }),
      );
      return entry.kind === "tool" ? entry.summary : "";
    };

    expect(summaryOf({ file_path: "/app/x.ts" })).toBe("/app/x.ts");
    expect(summaryOf({ pattern: "TODO" })).toBe("TODO");
    expect(summaryOf({ description: "Look around" })).toBe("Look around");
    expect(summaryOf({})).toBe("Read");
  });

  it("shows tool output rather than the envelope around it", () => {
    const entry = summarise(
      event("agent.user", {
        message: { content: [{ type: "tool_result", content: "ignored" }] },
        tool_use_result: { stdout: "hello\nworld", stderr: "" },
      }),
    );
    expect(entry).toEqual({ kind: "output", text: "hello\nworld", failed: false });
  });

  // stderr is noise on success and the whole story on failure.
  it("includes stderr only when the call failed", () => {
    const ok = summarise(
      event("agent.user", {
        message: { content: [{ type: "tool_result", content: "" }] },
        tool_use_result: { stdout: "fine", stderr: "a warning" },
      }),
    );
    expect(ok).toEqual({ kind: "output", text: "fine", failed: false });

    const bad = summarise(
      event("agent.user", {
        message: { content: [{ type: "tool_result", content: "", is_error: true }] },
        tool_use_result: { stdout: "partial", stderr: "boom" },
      }),
    );
    expect(bad).toEqual({ kind: "output", text: "partial\nboom", failed: true });
  });

  it("says so when a tool produced nothing", () => {
    const entry = summarise(
      event("agent.user", {
        message: { content: [{ type: "tool_result", content: "" }] },
        tool_use_result: { stdout: "", stderr: "" },
      }),
    );
    expect(entry).toMatchObject({ kind: "output", text: "(no output)" });
  });

  it("surfaces a reasoning block", () => {
    expect(
      summarise(event("agent.assistant", { thinking: "weighing options" })),
    ).toEqual({
      kind: "thinking",
      text: "weighing options",
    });
  });

  it("carries the error on a failed status", () => {
    expect(
      summarise(event("mission.status", { status: "failed", error: "git blew up" })),
    ).toEqual({ kind: "status", text: "failed", error: "git blew up" });
  });

  it("reads the launch prompt as the operator speaking", () => {
    expect(summarise(event("mission.created", { prompt: "Fix the bug" }))).toEqual({
      kind: "said",
      who: "operator",
      text: "Fix the bug",
    });
  });

  it("describes what is being asked for", () => {
    expect(
      summarise(
        event("mission.prompt", {
          promptId: "p1",
          toolName: "Bash",
          input: { command: "rm -rf build" },
        }),
      ),
    ).toEqual({ kind: "asked", name: "Bash", summary: "rm -rf build" });
  });

  // The init payload lists every tool, command and skill available. It is a
  // page of noise in the middle of a conversation.
  it.each(["agent.system", "agent.rate_limit_event"])("hides %s", (type) => {
    expect(
      summarise(event(type, { type, subtype: "init", tools: ["a", "b"] })),
    ).toEqual({
      kind: "hidden",
    });
  });

  it("does not invent content for an empty message", () => {
    expect(summarise(event("agent.assistant", { message: { content: [] } }))).toEqual({
      kind: "hidden",
    });
  });

  it("names an unrecognised event rather than dropping it", () => {
    expect(summarise(event("agent.something_new", {}))).toEqual({
      kind: "note",
      text: "agent.something_new",
    });
  });

  it("survives a payload that is not an object", () => {
    expect(() => summarise(event("agent.assistant", null))).not.toThrow();
    expect(() => summarise(event("agent.user", "text"))).not.toThrow();
  });
});

describe("toTranscript", () => {
  it("keeps the raw payload for every entry", () => {
    const [item] = toTranscript([
      { seq: 4, ts: "t", type: "agent.assistant", payload: { thinking: "hm" } },
    ]);
    expect(item).toMatchObject({ seq: 4, type: "agent.assistant" });
    expect(item?.raw).toEqual({ thinking: "hm" });
  });
});
