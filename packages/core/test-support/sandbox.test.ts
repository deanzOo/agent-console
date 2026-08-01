import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "./sandbox";

let sandbox: Sandbox | undefined;

afterEach(() => {
  sandbox?.cleanup();
  sandbox = undefined;
});

function make() {
  sandbox = createSandbox("sandbox-test-");
  return sandbox;
}

describe("createSandbox", () => {
  it("puts the fixture somewhere temporary", () => {
    expect(path.resolve(make().root).startsWith(path.resolve(tmpdir()))).toBe(true);
  });

  // The failure this exists for: a fixture path that was empty at the moment it
  // was used turned `git init --bare <path>` into "re-initialise the current
  // directory", which was the repository the suite was running in.
  it("refuses to run git with no working directory", () => {
    expect(() => make().git("", "status")).toThrow(/sandbox/i);
  });

  // `git init --bare ""` is not an error to git: an empty path means here.
  it("refuses an empty path argument", () => {
    const box = make();
    expect(() => box.git(box.root, "init", "--bare", "")).toThrow(/empty/i);
  });

  it("refuses to run git outside the fixture", () => {
    expect(() => make().git(process.cwd(), "status")).toThrow(/sandbox/i);
  });

  it("runs git inside the fixture", () => {
    const box = make();
    box.git(box.root, "init", "--quiet", "--initial-branch", "main");

    expect(() =>
      execFileSync("git", ["-C", box.root, "rev-parse", "--git-dir"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  // The other half of what happened: the push reached the real remote. A
  // fixture may only ever push somewhere inside itself.
  it("refuses to push to a remote outside the fixture", () => {
    const box = make();
    box.git(box.root, "init", "--quiet", "--initial-branch", "main");
    box.git(box.root, "remote", "add", "origin", "https://github.com/acme/widget.git");

    expect(() => box.git(box.root, "push", "origin", "main")).toThrow(/outside/i);
  });

  it("allows a push to a remote inside the fixture", () => {
    const box = make();
    const origin = path.join(box.root, "origin.git");
    const work = path.join(box.root, "work");

    box.git(box.root, "init", "--bare", "--quiet", "--initial-branch", "main", origin);
    box.git(box.root, "clone", "--quiet", origin, work);
    box.git(work, "config", "user.email", "t@example.com");
    box.git(work, "config", "user.name", "Test");
    box.git(work, "commit", "--quiet", "--allow-empty", "-m", "first");

    expect(() => box.git(work, "push", "--quiet", "origin", "main")).not.toThrow();
  });

  // A global or system config could name a credential helper, a signing key, or
  // an alias that changes what these commands do.
  it("ignores the machine's git configuration", () => {
    const box = make();
    box.git(box.root, "init", "--quiet", "--initial-branch", "main");

    const scopes = box.read(box.root, "config", "--show-origin", "--list");

    expect(scopes).not.toMatch(/\.gitconfig/);
  });
});
