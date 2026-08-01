import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("pr-summary.mjs", import.meta.url));

/** The row for one of the three columns, so assertions name what they read. */
function rowFor(output: string, label: string): string {
  return output.split("\n").find((line) => line.startsWith(`| ${label} `)) ?? "";
}

/** Runs the script over a `git diff --numstat` fixture fed on stdin. */
function summarize(numstat: string): string {
  return execFileSync("node", [SCRIPT], {
    input: numstat,
    encoding: "utf8",
  });
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
  it("measures the ratio against application code alone", () => {
    const output = summarize(
      [
        row(60, 0, ".github/workflows/pr-summary.yml"),
        row(136, 0, "scripts/pr-summary.mjs"),
        row(107, 0, "scripts/pr-summary.test.ts"),
      ].join("\n"),
    );

    expect(output).toContain("79%");
  });

  it("counts documentation separately from code", () => {
    const output = summarize(row(12, 3, "docs/adr/0008-a-decision.md"));

    expect(rowFor(output, "Docs")).toContain("+12");
    expect(rowFor(output, "Docs")).toContain("\u22123");
    expect(rowFor(output, "App")).toBe("");
  });

  // The ratio is the number the reviewer actually reads: it says whether the
  // change brought its tests with it.
  it("reports how much test code came with the change", () => {
    const output = summarize(
      [
        row(100, 0, "packages/core/thing.ts"),
        row(50, 0, "packages/core/thing.test.ts"),
      ].join("\n"),
    );

    expect(output).toContain("50%");
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
