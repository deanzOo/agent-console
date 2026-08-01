#!/usr/bin/env node
// Summarises a pull request the way a reviewer reads one: how much application
// code changed, how much test code came with it, and whether the change touches
// anything this repository treats as a checkpoint.
//
// Reads `git diff --numstat` on stdin, or runs it against a base ref given as
// the first argument.

import { execFileSync } from "node:child_process";

const MIGRATIONS = "drizzle/";
const CONFIG_CONTRACT = ".env.example";
const GATE = "ci/checks.json";

const DOC_EXTENSIONS = [".md"];

function isTest(file) {
  return file.includes(".test.") || file.includes("/__tests__/");
}

function isDoc(file) {
  return DOC_EXTENSIONS.some((extension) => file.endsWith(extension));
}

/** Which of the three columns a file belongs in. */
export function classify(file) {
  if (isDoc(file)) return "docs";
  return isTest(file) ? "test" : "app";
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

function ratio(totals) {
  if (totals.app.added === 0) return undefined;
  return Math.round((totals.test.added / totals.app.added) * 100);
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

export function render({ totals, touched }) {
  if (touched.length === 0) return "No files changed.";

  const rows = [
    ["App", totals.app],
    ["Test", totals.test],
    ["Docs", totals.docs],
  ]
    .filter(([, bucket]) => bucket.files > 0)
    .map(
      ([label, bucket]) =>
        `| ${label} | ${bucket.files} | +${bucket.added} | −${bucket.removed} |`,
    );

  const proportion = ratio(totals);
  const verdict =
    totals.app.added === 0
      ? "No application code changed."
      : proportion === 0
        ? "**This change carries no test code.**"
        : `Test lines per application line: **${proportion}%**`;

  return [
    "| | Files | Added | Removed |",
    "| --- | ---: | ---: | ---: |",
    ...rows,
    "",
    verdict,
    "",
    ...checkpoints(touched),
  ].join("\n");
}

const base = process.argv[2];
process.stdout.write(`${render(summarize(await readNumstat(base)))}\n`);
