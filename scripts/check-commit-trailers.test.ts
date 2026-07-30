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
