import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("pr-summary.mjs", import.meta.url));

/** The row for one of the three columns, so assertions name what they read. */
function rowFor(output: string, label: string): string {
  return output.split("\n").find((line) => line.startsWith(`| ${label} `)) ?? "";
}

/** Runs the script over a `git diff --numstat` fixture fed on stdin. */
function summarize(numstat: string, coverage?: unknown): string {
  const args = [SCRIPT];
  let file: string | undefined;
  if (coverage) {
    file = path.join(tmpdir(), `cov-${process.pid}-${counter++}.json`);
    writeFileSync(file, JSON.stringify(coverage));
    args.push("--coverage", file);
  }
  try {
    return execFileSync("node", args, { input: numstat, encoding: "utf8" });
  } finally {
    if (file) rmSync(file, { force: true });
  }
}

let counter = 0;

function coveredFile(pct: number) {
  return {
    lines: { total: 100, covered: pct, pct },
    branches: { total: 50, covered: pct / 2, pct },
    functions: { total: 10, covered: 1, pct },
    statements: { total: 100, covered: pct, pct },
  };
}

function row(added: number, removed: number, file: string) {
  return `${added}\t${removed}\t${file}`;
}

describe("pr-summary", () => {
  it("separates application code from its tests", () => {
    const output = summarize(
      [
        row(60, 21, "packages/core/publish.ts"),
        row(52, 0, "packages/core/publish.test.ts"),
      ].join("\n"),
    );

    expect(rowFor(output, "App")).toContain("+60");
    expect(rowFor(output, "App")).toContain("\u221221");
    expect(rowFor(output, "Test")).toContain("+52");
  });

  // A workflow file is not application code, and counting it as such made a
  // change that was almost entirely CI configuration look untested.
  it("counts configuration separately from application code", () => {
    const output = summarize(
      [
        row(60, 0, ".github/workflows/pr-summary.yml"),
        row(19, 0, ".gitleaks.toml"),
        row(8, 0, "ci/checks.json"),
        row(136, 0, "scripts/pr-summary.mjs"),
        row(107, 0, "scripts/pr-summary.test.ts"),
      ].join("\n"),
    );

    expect(rowFor(output, "Config")).toContain("+87");
    expect(rowFor(output, "App")).toContain("+136");
  });

  // 107 test lines against 136 of application code, not against the 240 that
  // counting configuration as application code would have produced.
  it("counts the comparison against application code alone", () => {
    const output = summarize(
      [
        row(60, 0, ".github/workflows/pr-summary.yml"),
        row(136, 0, "scripts/pr-summary.mjs"),
        row(107, 0, "scripts/pr-summary.test.ts"),
      ].join("\n"),
    );

    expect(output).toContain("107 test lines");
    expect(output).toContain("136");
    expect(output).not.toContain("196");
  });

  it("counts documentation separately from code", () => {
    const output = summarize(row(12, 3, "docs/adr/0008-a-decision.md"));

    expect(rowFor(output, "Docs")).toContain("+12");
    expect(rowFor(output, "Docs")).toContain("\u22123");
    expect(rowFor(output, "App")).toBe("");
  });

  // A percentage over a small denominator says nothing a reader can use: a
  // change that is almost entirely tests reported 2214%, which reads as a bug
  // rather than as "this one brought its tests".
  it("compares test and application lines without inventing a percentage", () => {
    const output = summarize(
      [
        row(43, 0, "packages/core/thing.ts"),
        row(952, 0, "packages/core/thing.test.ts"),
      ].join("\n"),
    );

    expect(output).toContain("952 test lines");
    expect(output).toContain("43");
    expect(output).not.toMatch(/\d{3,}%/);
  });

  it("says so when a change carries no tests at all", () => {
    const output = summarize(row(40, 0, "packages/core/thing.ts"));

    expect(output).toMatch(/no test/i);
  });

  // These are this repository's own checkpoints, the ones CLAUDE.md says to
  // stop at: a migration, the configuration contract, and the gate itself.
  it("calls out a migration", () => {
    const output = summarize(row(9, 0, "drizzle/0003_add_a_column.sql"));

    expect(output).toMatch(/migration/i);
    expect(output).toContain("0003_add_a_column.sql");
  });

  it("says when there is no migration", () => {
    const output = summarize(row(1, 1, "README.md"));

    expect(output).toMatch(/no new migration/i);
  });

  it("calls out a change to the configuration contract", () => {
    const output = summarize(row(3, 0, ".env.example"));

    expect(output).toMatch(/\.env\.example/);
  });

  it("calls out a change to the gate", () => {
    const output = summarize(row(6, 0, "ci/checks.json"));

    expect(output).toMatch(/checks\.json/);
  });

  // A binary file has no line counts; git writes dashes where the numbers go.
  it("survives a binary file", () => {
    const output = summarize(
      [
        "-\t-\tapps/web/public/icons/icon-192.png",
        row(2, 0, "packages/core/x.ts"),
      ].join("\n"),
    );

    expect(rowFor(output, "App")).toContain("+2");
  });

  it("handles an empty diff without inventing numbers", () => {
    expect(summarize("")).toMatch(/no file/i);
  });
});

// Lines written is a proxy; lines executed under test is the thing itself. And
// only for what the change touches: the whole codebase's number says nothing
// about whether this pull request is tested.
describe("coverage of the files a change touches", () => {
  const root = process.cwd();

  it("reports coverage per changed file", () => {
    const output = summarize(row(40, 0, "packages/core/thing.ts"), {
      total: coveredFile(94),
      [`${root}/packages/core/thing.ts`]: coveredFile(72),
    });

    expect(output).toContain("packages/core/thing.ts");
    expect(output).toContain("72%");
  });

  // A file with no coverage entry is markup, configuration or a test — saying
  // "0%" about a workflow file would be worse than saying nothing.
  it("leaves out files coverage does not measure", () => {
    const output = summarize(
      [
        row(9, 0, ".github/workflows/ci.yml"),
        row(40, 0, "packages/core/thing.ts"),
      ].join("\n"),
      { total: coveredFile(94), [`${root}/packages/core/thing.ts`]: coveredFile(72) },
    );

    expect(output).not.toContain("ci.yml |");
  });

  // The one that would have been caught: a change touching only untested code
  // should be obvious, whatever the ratio of lines written says.
  it("names a changed file that no test reaches", () => {
    const output = summarize(row(40, 0, "packages/core/thing.ts"), {
      total: coveredFile(94),
      [`${root}/packages/core/thing.ts`]: coveredFile(0),
    });

    expect(output).toContain("0%");
  });

  it("says so when no coverage report was given", () => {
    expect(summarize(row(40, 0, "packages/core/thing.ts"))).not.toContain("Coverage");
  });
});
