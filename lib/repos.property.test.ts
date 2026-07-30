import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { barePath, branchNameFor, worktreePath } from "./repos";

const MAX_BRANCH_LENGTH = 60;
const WORKSPACE = "/srv/workspace";

const segment = fc
  .stringMatching(/^[A-Za-z0-9._-]+$/)
  .filter((s) => s.length > 0 && !s.includes(".."));
const fullName = fc.tuple(segment, segment).map(([owner, repo]) => `${owner}/${repo}`);
// Mission ids are randomUUID() everywhere they are produced, so generating
// arbitrary matches of the accepted alphabet would test inputs that cannot occur.
const missionId = fc.uuid();
// The mission title is operator input and can be anything at all.
const title = fc.string();

// The paths these produce are handed to `git clone` and `rm -rf`. A name that
// escapes the workspace root is the difference between a scratch directory and
// somebody else's files.
describe("path derivation stays inside the workspace", () => {
  it("keeps every bare repo path under the workspace root", () => {
    fc.assert(
      fc.property(fullName, (name) => {
        const resolved = path.resolve(barePath(WORKSPACE, name));
        // Resolving first is the point: a name that climbs out shows up as a
        // parent directory here, however innocent the raw string looked.
        expect(path.dirname(resolved)).toBe(path.join(WORKSPACE, "repos"));
      }),
    );
  });

  it("keeps every worktree path under the workspace root", () => {
    fc.assert(
      fc.property(missionId, (id) => {
        const resolved = path.resolve(worktreePath(WORKSPACE, id));
        expect(path.dirname(resolved)).toBe(path.join(WORKSPACE, "wt"));
      }),
    );
  });

  it("rejects a repo name that is not exactly owner/repo", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s)),
        (name) => {
          expect(() => barePath(WORKSPACE, name)).toThrow();
        },
      ),
    );
  });

  it("rejects a mission id outside the allowed alphabet", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^[A-Za-z0-9-]+$/.test(s)),
        (id) => {
          expect(() => worktreePath(WORKSPACE, id)).toThrow();
        },
      ),
    );
  });
});

// git rejects a ref with these shapes outright, so a title that produced one
// would fail at branch creation — after the worktree already exists.
describe("branch names are always valid git refs", () => {
  it("produces a ref git will accept, from any title", () => {
    fc.assert(
      fc.property(title, missionId, (t, id) => {
        const branch = branchNameFor(t, id);

        expect(branch.startsWith("agent/")).toBe(true);
        expect(branch.length).toBeLessThanOrEqual(MAX_BRANCH_LENGTH);
        expect(branch).not.toMatch(/\.\.|[~^:?*[\\\s]/);
        // git's own rules: a ref may not end in "." or "/". A trailing "-" is
        // legal, so asserting against it would be taste, not correctness.
        expect(branch).not.toMatch(/[/.]$/);
        expect(branch).not.toMatch(/\/\//);
        expect(branch.endsWith(".lock")).toBe(false);
      }),
    );
  });

  it("is deterministic for the same inputs", () => {
    fc.assert(
      fc.property(title, missionId, (t, id) => {
        expect(branchNameFor(t, id)).toBe(branchNameFor(t, id));
      }),
    );
  });
});
