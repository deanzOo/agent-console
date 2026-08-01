import { describe, expect, it } from "vitest";
import { groupTranscript, summarise, toTranscript } from "./transcript";

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

  // Reasoning is how it got there, not what it did. Still reachable as raw.
  it("hides reasoning", () => {
    expect(summarise(event("agent.assistant", { thinking: "weighing" }))).toEqual({
      kind: "hidden",
    });
  });

  // The tool call says the same thing, and the approval is pinned to the screen
  // while it is open. A third copy is noise.
  it("hides the approval request, which the tool call already shows", () => {
    expect(
      summarise(
        event("mission.prompt", {
          promptId: "p1",
          toolName: "Bash",
          input: { command: "rm -rf build" },
        }),
      ),
    ).toEqual({ kind: "hidden" });
  });

  // A mission flips between running and awaiting_input on every approval: in one
  // real transcript that was seventy lines saying nothing.
  it.each(["running", "awaiting_input", "starting"])(
    "hides the %s status",
    (status) => {
      expect(summarise(event("mission.status", { status }))).toEqual({
        kind: "hidden",
      });
    },
  );

  it.each(["done", "failed", "stopped"])("keeps the %s status", (status) => {
    expect(summarise(event("mission.status", { status })).kind).toBe("status");
  });

  it("always keeps a status that carries an error", () => {
    expect(
      summarise(event("mission.status", { status: "running", error: "boom" })),
    ).toMatchObject({ kind: "status", error: "boom" });
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

describe("groupTranscript", () => {
  function item(seq: number, type: string, payload: unknown) {
    return toTranscript([{ seq, ts: "t", type, payload }])[0]!;
  }

  const said = (seq: number) =>
    item(seq, "agent.assistant", {
      message: { content: [{ type: "text", text: "hi" }] },
    });
  const system = (seq: number) => item(seq, "agent.system", { subtype: "init" });

  it("leaves visible entries alone", () => {
    const groups = groupTranscript([said(1), said(2)]);
    expect(groups.map((g) => g.kind)).toEqual(["entry", "entry"]);
  });

  // 164 one-line placeholders is still 164 rows to scroll past.
  it("folds a run of hidden events into one line with a count", () => {
    const groups = groupTranscript([system(1), system(2), system(3)]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "collapsed", label: "agent.system" });
    expect(groups[0]?.kind === "collapsed" && groups[0].items).toHaveLength(3);
  });

  it("does not fold across a visible entry", () => {
    const groups = groupTranscript([system(1), said(2), system(3)]);
    expect(groups.map((g) => g.kind)).toEqual(["collapsed", "entry", "collapsed"]);
  });

  // "agent.system (3)" says something; "hidden (3)" of three different kinds
  // says nothing.
  it("only folds runs of the same type", () => {
    const rate = item(9, "agent.rate_limit_event", {});
    const groups = groupTranscript([system(1), rate, system(3)]);
    expect(groups).toHaveLength(3);
  });

  it("keeps every underlying item, so nothing is lost", () => {
    const groups = groupTranscript([system(1), system(2)]);
    const kept = groups.flatMap((g) => (g.kind === "collapsed" ? g.items : [g.item]));
    expect(kept.map((i) => i.seq)).toEqual([1, 2]);
  });
});

describe("edits", () => {
  function edit(name: string, input: unknown) {
    return summarise(
      event("agent.assistant", {
        message: { content: [{ type: "tool_use", name, input }] },
      }),
    );
  }

  it("reads an Edit as the lines that go and the lines that arrive", () => {
    expect(
      edit("Edit", {
        file_path: "/app/x.ts",
        old_string: "const a = 1;\nconst b = 2;",
        new_string: "const a = 1;\nconst b = 3;\nconst c = 4;",
      }),
    ).toEqual({
      kind: "edit",
      path: "/app/x.ts",
      removed: ["const a = 1;", "const b = 2;"],
      added: ["const a = 1;", "const b = 3;", "const c = 4;"],
    });
  });

  // An empty string is no lines, not one blank one, or every insertion reports
  // a removal it did not make.
  it("counts an insertion as adding only", () => {
    const result = edit("Edit", { file_path: "/a", old_string: "", new_string: "new" });
    expect(result).toMatchObject({ removed: [], added: ["new"] });
  });

  it("treats a Write as all additions, since it replaces the file", () => {
    expect(edit("Write", { file_path: "/a", content: "one\ntwo" })).toMatchObject({
      removed: [],
      added: ["one", "two"],
    });
  });

  it("sums every hunk of a MultiEdit", () => {
    expect(
      edit("MultiEdit", {
        file_path: "/a",
        edits: [
          { old_string: "x", new_string: "y" },
          { old_string: "p\nq", new_string: "r" },
        ],
      }),
    ).toMatchObject({ removed: ["x", "p", "q"], added: ["y", "r"] });
  });

  it("falls back to a plain tool line when there is nothing to diff", () => {
    expect(edit("Edit", { file_path: "/a" }).kind).toBe("tool");
  });

  it("leaves other tools alone", () => {
    expect(edit("Bash", { command: "ls" })).toEqual({
      kind: "tool",
      name: "Bash",
      summary: "ls",
    });
  });
});
