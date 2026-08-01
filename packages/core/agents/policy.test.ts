import { describe, expect, it } from "vitest";
import { EDIT_TOOLS, READ_ONLY_TOOLS, autoApproves, type Policy } from "./policy";

function policy(over: Partial<Policy> = {}): Policy {
  return { mode: "default", allowed: new Set(), ...over };
}

describe("autoApproves", () => {
  it.each(READ_ONLY_TOOLS)("never asks about %s", (tool) => {
    expect(autoApproves(policy(), tool)).toBe(true);
  });

  it.each(EDIT_TOOLS)("asks about %s in the default mode", (tool) => {
    expect(autoApproves(policy(), tool)).toBe(false);
  });

  // The mode did nothing before: the hook decides, and it did not read the mode
  // at all, so "auto edits" asked about every edit anyway.
  it.each(EDIT_TOOLS)("stops asking about %s once edits are automatic", (tool) => {
    expect(autoApproves(policy({ mode: "acceptEdits" }), tool)).toBe(true);
  });

  // A shell in a container holding a git token is the thing the operator is
  // here to watch, so no mode waves it through.
  it.each(["default", "acceptEdits", "plan"] as const)(
    "still asks about Bash in %s mode",
    (mode) => {
      expect(autoApproves(policy({ mode }), "Bash")).toBe(false);
    },
  );

  it.each(["WebFetch", "WebSearch", "Task"])("still asks about %s", (tool) => {
    expect(autoApproves(policy({ mode: "acceptEdits" }), tool)).toBe(false);
  });

  it("remembers a tool the operator has already allowed", () => {
    expect(autoApproves(policy({ allowed: new Set(["Bash"]) }), "Bash")).toBe(true);
  });

  it("remembers per tool, not for everything", () => {
    const remembered = policy({ allowed: new Set(["Bash"]) });
    expect(autoApproves(remembered, "Write")).toBe(false);
  });

  it("does not treat an unknown tool as safe", () => {
    expect(autoApproves(policy({ mode: "acceptEdits" }), "SomethingNew")).toBe(false);
  });
});
