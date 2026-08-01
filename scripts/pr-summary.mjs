#!/usr/bin/env node
// Summarises a pull request the way a reviewer reads one: how much application
// code changed, how much test code came with it, and whether the change touches
// anything this repository treats as a checkpoint.
//
// Reads `git diff --numstat` on stdin, or runs it against a base ref given as
// the first argument.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = "drizzle/";
const CONFIG_CONTRACT = ".env.example";
const GATE = "ci/checks.json";

const DOC_EXTENSIONS = [".md"];

// Counting these as application code makes a change that is mostly CI
// configuration read as untested, which is the opposite of informative.
const CONFIG_EXTENSIONS = [".yml", ".yaml", ".toml", ".json"];
const CONFIG_DIRECTORIES = [".github/", "ci/"];

function isTest(file) {
  return file.includes(".test.") || file.includes("/__tests__/");
}

function isDoc(file) {
  return DOC_EXTENSIONS.some((extension) => file.endsWith(extension));
}

function isConfig(file) {
  return (
    CONFIG_EXTENSIONS.some((extension) => file.endsWith(extension)) ||
    CONFIG_DIRECTORIES.some((directory) => file.startsWith(directory))
  );
}

/** Which column a file belongs in. */
export function classify(file) {
  if (isDoc(file)) return "docs";
  if (isTest(file)) return "test";
  return isConfig(file) ? "config" : "app";
}

// Reading fd 0 directly throws EAGAIN when stdin is a non-blocking pipe, which
// is how a shell hands it over. The stream handles that; a bare read does not.
async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function readNumstat(base) {
  if (base) {
    return execFileSync("git", ["diff", "--numstat", `${base}...HEAD`], {
      encoding: "utf8",
    });
  }
  return readStdin();
}

export function summarize(numstat) {
  const totals = {
    app: { added: 0, removed: 0, files: 0 },
    test: { added: 0, removed: 0, files: 0 },
    docs: { added: 0, removed: 0, files: 0 },
    config: { added: 0, removed: 0, files: 0 },
  };
  const touched = [];

  for (const line of numstat.split("\n")) {
    if (line.trim().length === 0) continue;
    const [added, removed, file] = line.split("\t");
    if (!file) continue;

    touched.push(file);
    const bucket = totals[classify(file)];
    bucket.files += 1;
    // git writes a dash for a binary file, which has no lines to count.
    bucket.added += Number.parseInt(added ?? "", 10) || 0;
    bucket.removed += Number.parseInt(removed ?? "", 10) || 0;
  }

  return { totals, touched };
}

/**
 * Coverage for the files this change touches.
 *
 * The codebase-wide number barely moves and says nothing about the change in
 * front of the reviewer. A file the change touched that no test reaches is the
 * thing worth seeing, and lines written is only ever a proxy for it.
 */
function patchCoverage(touched, reportPath) {
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return [];
  }

  const root = process.cwd();
  const rows = [];
  for (const file of touched) {
    const entry = report[path.resolve(root, file)];
    if (!entry) continue;
    rows.push({
      file,
      lines: entry.lines?.pct ?? 0,
      branches: entry.branches?.pct ?? 0,
    });
  }
  return rows;
}

function checkpoints(touched) {
  const migrations = touched.filter(
    (file) => file.startsWith(MIGRATIONS) && file.endsWith(".sql"),
  );
  const lines = [];

  lines.push(
    migrations.length > 0
      ? `**Migration in this pull request:** ${migrations.join(", ")} — the generated SQL is reviewed, never hand-edited.`
      : "No new migrations in this pull request.",
  );

  if (touched.includes(CONFIG_CONTRACT)) {
    lines.push(
      `**\`${CONFIG_CONTRACT}\` changed** — it is the configuration contract, so every key needs its documentation.`,
    );
  }
  if (touched.includes(GATE)) {
    lines.push(`**\`${GATE}\` changed** — the gate itself moved.`);
  }

  return lines;
}

// The counterpart to the per-change ratio: how much test code the project
// carries overall. A change can be light on tests without the codebase being.
function codebaseRatio() {
  try {
    const files = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    let app = 0;
    let test = 0;
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n").length;
      if (isTest(file)) test += lines;
      else app += lines;
    }
    if (app === 0) return undefined;
    return `Across the codebase: **${Math.round((test / app) * 100)}%** test lines per application line.`;
  } catch {
    // Only ever a nicety; a summary without it is still a summary.
    return undefined;
  }
}

function coverageSection(rows) {
  if (rows.length === 0) return [];

  return [
    "",
    "**Coverage of the files this change touches**",
    "",
    "| File | Lines | Branches |",
    "| --- | ---: | ---: |",
    ...rows.map((row) => `| \`${row.file}\` | ${row.lines}% | ${row.branches}% |`),
  ];
}

export function render({ totals, touched }, includeCodebase = false, coverage = []) {
  if (touched.length === 0) return "No files changed.";

  const rows = [
    ["App", totals.app],
    ["Test", totals.test],
    ["Config", totals.config],
    ["Docs", totals.docs],
  ]
    .filter(([, bucket]) => bucket.files > 0)
    .map(
      ([label, bucket]) =>
        `| ${label} | ${bucket.files} | +${bucket.added} | −${bucket.removed} |`,
    );

  const verdict =
    totals.app.added === 0
      ? "No application code changed."
      : totals.test.added === 0
        ? "**This change carries no test code.**"
        : `${totals.test.added} test lines alongside ${totals.app.added} of application code.`;

  const overall = includeCodebase ? codebaseRatio() : undefined;

  return [
    "| | Files | Added | Removed |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    "",
    verdict,
    ...(overall ? [overall] : []),
    ...coverageSection(coverage),
    "",
    ...checkpoints(touched),
  ].join("\n");
}

const flags = process.argv.slice(2);
const coverageAt = flags.indexOf("--coverage");
const reportPath = coverageAt === -1 ? undefined : flags[coverageAt + 1];
const base = flags.find(
  (flag, index) => !flag.startsWith("--") && index !== coverageAt + 1,
);
// Off when reading a fixture on stdin: the ratio would be that of whatever
// repository the test happens to run in.
const summary = summarize(await readNumstat(base));
const coverage = reportPath ? patchCoverage(summary.touched, reportPath) : [];
process.stdout.write(`${render(summary, Boolean(base), coverage)}\n`);
