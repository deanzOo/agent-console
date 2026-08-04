import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeBundle, readBundle } from "./okf";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "okf-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function concept(file: string, body: string) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
}

const RUNBOOK = `---
type: Runbook
title: Restarting the session host
description: What to do when missions stop responding.
tags: [operations]
---

# Steps

Restart the container. Missions resume on their own.
`;

describe("readBundle", () => {
  it("reads a concept and its metadata", () => {
    concept("runbooks/restart.md", RUNBOOK);

    const [found] = readBundle(dir);

    expect(found).toMatchObject({
      type: "Runbook",
      title: "Restarting the session host",
      description: "What to do when missions stop responding.",
      path: "runbooks/restart.md",
    });
  });

  // `type` is the one key the format requires. A file without it is not a
  // concept, and the spec says a consumer must not reject the bundle over it.
  it("skips a file with no type, and keeps the rest", () => {
    concept("runbooks/restart.md", RUNBOOK);
    concept("notes/stray.md", "---\ntitle: No type here\n---\n\nText.\n");

    expect(readBundle(dir).map((c) => c.path)).toEqual(["runbooks/restart.md"]);
  });

  it("skips a file with no frontmatter at all", () => {
    concept("readme-ish.md", "# Just markdown\n\nNothing structured.\n");

    expect(readBundle(dir)).toEqual([]);
  });

  // index.md and log.md have defined meaning at any level and are not concepts.
  it.each(["index.md", "log.md", "runbooks/index.md"])("skips %s", (reserved) => {
    concept("runbooks/restart.md", RUNBOOK);
    concept(reserved, "---\ntype: Index\n---\n");

    expect(readBundle(dir).map((c) => c.path)).toEqual(["runbooks/restart.md"]);
  });

  it("ignores files that are not markdown", () => {
    concept("runbooks/restart.md", RUNBOOK);
    writeFileSync(path.join(dir, "notes.txt"), "---\ntype: Note\n---\n");

    expect(readBundle(dir)).toHaveLength(1);
  });

  // A bundle that is not there is a deployment without one, not a fault.
  it("is empty for a directory that does not exist", () => {
    expect(readBundle(path.join(dir, "absent"))).toEqual([]);
  });

  // "Consumers MUST NOT reject a bundle because of ... unknown type values."
  it("accepts a type it has never seen", () => {
    concept("odd.md", "---\ntype: Something Invented\n---\n");

    expect(readBundle(dir)[0]).toMatchObject({ type: "Something Invented" });
  });

  it("survives frontmatter that is not valid YAML", () => {
    concept("runbooks/restart.md", RUNBOOK);
    concept("broken.md", "---\ntype: [unclosed\n---\n");

    expect(readBundle(dir).map((c) => c.path)).toEqual(["runbooks/restart.md"]);
  });

  it("reads a nested structure, deepest included", () => {
    concept("a/b/c/deep.md", "---\ntype: Note\ntitle: Deep\n---\n");

    expect(readBundle(dir)[0]).toMatchObject({ path: "a/b/c/deep.md" });
  });

  // Deprecated concepts are still in the bundle; whether to show one is the
  // caller's decision, so the status has to survive the read.
  it("keeps the lifecycle status", () => {
    concept("old.md", "---\ntype: Runbook\nstatus: deprecated\n---\n");

    expect(readBundle(dir)[0]).toMatchObject({ status: "deprecated" });
  });
});

describe("describeBundle", () => {
  it("says nothing when there is no bundle", () => {
    expect(describeBundle([], "/knowledge")).toBeUndefined();
  });

  // The agent is told what exists and where, and reads what it needs. Pasting
  // every concept into the prompt would spend the context it is meant to save.
  it("lists what is available and where to read it", () => {
    concept("runbooks/restart.md", RUNBOOK);

    const text = describeBundle(readBundle(dir), "/knowledge");

    expect(text).toContain("/knowledge/runbooks/restart.md");
    expect(text).toContain("Restarting the session host");
    expect(text).toContain("Runbook");
    expect(text).not.toContain("Restart the container");
  });

  // The format says an absent status means stable, so saying "[stable]" on
  // every line is noise standing in for information.
  it("says nothing about status when there is nothing to say", () => {
    concept("runbooks/restart.md", RUNBOOK);

    expect(describeBundle(readBundle(dir), "/knowledge")).not.toContain("[stable]");
  });

  it("marks a deprecated concept rather than hiding it", () => {
    concept("old.md", "---\ntype: Runbook\ntitle: Old way\nstatus: deprecated\n---\n");

    expect(describeBundle(readBundle(dir), "/knowledge")).toContain("deprecated");
  });
});
