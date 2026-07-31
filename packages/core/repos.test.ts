import { describe, expect, it } from "vitest";
import { barePath, branchNameFor, worktreePath } from "./repos";

const ROOT = "/srv/work";

describe("barePath", () => {
  it("puts the bare clone under repos/", () => {
    expect(barePath(ROOT, "owner/project")).toBe("/srv/work/repos/owner__project.git");
  });

  it("flattens the owner so two owners can share a repo name", () => {
    expect(barePath(ROOT, "a/tools")).not.toBe(barePath(ROOT, "b/tools"));
  });

  it("rejects a name that would escape the workspace", () => {
    expect(() => barePath(ROOT, "../../etc/passwd")).toThrowError(/repository/i);
  });

  it("rejects a name without an owner", () => {
    expect(() => barePath(ROOT, "project")).toThrowError(/repository/i);
  });

  it("rejects an empty name", () => {
    expect(() => barePath(ROOT, "")).toThrowError(/repository/i);
  });
});

describe("worktreePath", () => {
  it("gives each mission its own directory", () => {
    expect(worktreePath(ROOT, "m-1")).toBe("/srv/work/wt/m-1");
    expect(worktreePath(ROOT, "m-2")).toBe("/srv/work/wt/m-2");
  });

  it("rejects a mission id containing a path separator", () => {
    expect(() => worktreePath(ROOT, "../escape")).toThrowError(/mission id/i);
  });
});

describe("branchNameFor", () => {
  it("builds a readable slug from the title", () => {
    expect(branchNameFor("Fix the login bug", "abcdef12")).toBe(
      "agent/fix-the-login-bug-abcdef12",
    );
  });

  it("collapses punctuation and whitespace", () => {
    expect(branchNameFor("Fix   THE  ??? bug!", "abcdef12")).toBe(
      "agent/fix-the-bug-abcdef12",
    );
  });

  it("truncates a long title but keeps the id unique", () => {
    const name = branchNameFor("x".repeat(200), "abcdef12");
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith("abcdef12")).toBe(true);
  });

  it("still produces a valid branch when the title has nothing usable", () => {
    expect(branchNameFor("???", "abcdef12")).toBe("agent/abcdef12");
  });

  it("does not leave a trailing separator before the id", () => {
    expect(branchNameFor("trailing -- ", "abcdef12")).toBe("agent/trailing-abcdef12");
  });
});
