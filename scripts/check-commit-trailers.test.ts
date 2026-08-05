import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("check-commit-trailers.sh", import.meta.url));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "trailers-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function check(message: string): { accepted: boolean; stderr: string } {
  const file = path.join(dir, "COMMIT_EDITMSG");
  writeFileSync(file, message);
  try {
    execFileSync("bash", [SCRIPT, file], { stdio: "pipe" });
    return { accepted: true, stderr: "" };
  } catch (error) {
    const stderr = Object(error).stderr;
    return { accepted: false, stderr: String(stderr ?? "") };
  }
}

describe("check-commit-trailers", () => {
  it("accepts an ordinary commit", () => {
    expect(
      check("fix(auth): reject an expired session\n\nThe check was inverted.").accepted,
    ).toBe(true);
  });

  it("rejects a Co-Authored-By trailer", () => {
    expect(check("feat: add a thing\n\nCo-Authored-By: Someone <a@b.c>").accepted).toBe(
      false,
    );
  });

  it("rejects tool attribution", () => {
    expect(check("feat: add a thing\n\n🤖 Generated with Claude Code").accepted).toBe(
      false,
    );
  });

  // Dependabot signs every commit it opens. A DCO sign-off asserts the author's
  // own right to submit the code — it credits no one else, so treating it as
  // attribution blocks every dependency update the repository receives.
  it("accepts a Signed-off-by trailer", () => {
    expect(
      check(
        "chore(deps): bump the actions group\n\nSigned-off-by: dependabot[bot] <support@github.com>",
      ).accepted,
    ).toBe(true);
  });

  it("ignores trailers inside comment lines git adds to the template", () => {
    expect(
      check("feat: add a thing\n\n# Co-Authored-By: Someone <a@b.c>").accepted,
    ).toBe(true);
  });
});

// The check is about attribution, not vocabulary. This repository runs Claude
// Code, so its own README says the words — and a commit explaining what the
// code does was rejected for quoting it.
describe("naming the product", () => {
  it("accepts a body that explains what a mission is", () => {
    expect(
      check(
        "fix: cap concurrency\n\nA mission is a whole Claude Code process, not a request.",
      ).accepted,
    ).toBe(true);
  });

  it("still rejects the generated-with footer", () => {
    expect(check("feat: a thing\n\n🤖 Generated with Claude Code").accepted).toBe(
      false,
    );
  });

  it("still rejects a credit written as prose", () => {
    expect(check("feat: a thing\n\nWritten by Claude Code.").accepted).toBe(false);
  });

  it("still rejects a co-author trailer", () => {
    expect(
      check("feat: a thing\n\nCo-Authored-By: Someone <s@example.com>").accepted,
    ).toBe(false);
  });
});
