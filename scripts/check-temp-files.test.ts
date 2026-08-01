import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("check-temp-files.sh", import.meta.url));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "temp-files-check-"));
  execFileSync("git", ["init", "--quiet", dir], { stdio: "pipe" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a source file into the fixture repository and runs the check. */
function check(source: string): { accepted: boolean; output: string } {
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "thing.ts"), source);
  execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "pipe" });

  try {
    execFileSync("bash", [SCRIPT, dir], { stdio: "pipe" });
    return { accepted: true, output: "" };
  } catch (error) {
    return { accepted: false, output: String(Object(error).stdout ?? "") };
  }
}

describe("check-temp-files", () => {
  // The alert CodeQL raised on scripts/pr-summary.test.ts: a name built from
  // the pid, in a directory everyone can write to.
  it("rejects a path built from the pid", () => {
    const result = check(
      "const file = path.join(tmpdir(), `cov-${process.pid}-${n}.json`);",
    );

    expect(result.accepted).toBe(false);
    expect(result.output).toContain("mkdtempSync");
  });

  it("rejects a plain literal name", () => {
    expect(
      check('writeFileSync(path.join(tmpdir(), "report.json"), data);').accepted,
    ).toBe(false);
  });

  it("accepts a directory nobody can guess", () => {
    expect(
      check('const dir = mkdtempSync(path.join(tmpdir(), "prefix-"));').accepted,
    ).toBe(true);
  });

  it("accepts source that never touches the temp directory", () => {
    expect(
      check('const file = path.join(root, "coverage-summary.json");').accepted,
    ).toBe(true);
  });
});
