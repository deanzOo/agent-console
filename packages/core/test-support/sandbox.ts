import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A throwaway directory for git fixtures that cannot reach a real repository.
 *
 * A suite run once left `core.bare = true` on the repository it was running in,
 * committed fixture content to it, and pushed a fixture branch to the remote.
 * The signature was `git init --bare <path>` with an empty path, which
 * initialises the current directory instead. Nothing here relies on finding
 * that bug: an empty or outside path is refused before git sees it, and a push
 * to a remote outside the fixture is refused before it leaves the machine.
 */
export interface Sandbox {
  readonly root: string;
  /** Runs git inside the fixture, refusing anything that reaches beyond it. */
  git(cwd: string, ...args: string[]): void;
  /** The same, returning what git printed. */
  read(cwd: string, ...args: string[]): string;
  cleanup(): void;
}

function assertInside(candidate: string, root: string, what: string): void {
  if (candidate.trim().length === 0) {
    throw new Error(`sandbox: refusing to run git with an empty ${what}`);
  }

  const resolved = path.resolve(candidate);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`sandbox: ${what} is outside the sandbox: ${resolved}`);
  }
}

function remoteUrl(cwd: string, remote: string): string | undefined {
  try {
    return execFileSync("git", ["remote", "get-url", remote], {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

// A push is the only thing a fixture can do that leaves the machine, so it is
// the one command whose destination is checked rather than its arguments.
function assertPushStaysInside(cwd: string, args: string[], root: string): void {
  if (args[0] !== "push") return;

  const named = args.slice(1).find((arg) => !arg.startsWith("-"));
  const url = remoteUrl(cwd, named ?? "origin");
  if (url === undefined) return;

  const local = path.resolve(url.replace(/^file:\/\//, ""));
  if (!local.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(
      `sandbox: refusing to push to a remote outside the sandbox: ${url}`,
    );
  }
}

export function createSandbox(prefix: string): Sandbox {
  const root = mkdtempSync(path.join(tmpdir(), prefix));

  function run(cwd: string, args: string[], capture: boolean): string {
    assertInside(cwd, root, "working directory");
    for (const arg of args) {
      // An empty argument is never meaningful here, and git reads it as "the
      // current directory" — which is how a fixture reached a real repository.
      if (arg.length === 0) {
        throw new Error("sandbox: refusing to run git with an empty path argument");
      }
      if (path.isAbsolute(arg)) assertInside(arg, root, "path argument");
    }
    assertPushStaysInside(cwd, args, root);

    return execFileSync("git", args, {
      cwd,
      stdio: capture ? ["pipe", "pipe", "pipe"] : "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        // Nothing from the machine: a global config can name a signing key, a
        // credential helper, or an alias that changes what these commands do.
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
        // Stops git discovering a repository above the fixture, so a command
        // that would otherwise walk up into the real one finds nothing.
        GIT_CEILING_DIRECTORIES: root,
      },
    });
  }

  return {
    root,
    git(cwd, ...args) {
      run(cwd, args, false);
    },
    read(cwd, ...args) {
      return run(cwd, args, true);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
