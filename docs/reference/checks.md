# The gate

`npm run ci` runs everything CI runs. The list lives in [`ci/checks.json`](../../ci/checks.json), and both
sides read it — the local script iterates it, the GitHub matrix is built from it. A check cannot exist in one
place and not the other.

| Check                 | What it gates                                                          |
| --------------------- | ---------------------------------------------------------------------- |
| Typecheck             | `tsc --noEmit`, strict, `noUncheckedIndexedAccess`                     |
| Lint                  | ESLint — no `any`, no assertions, no unused, 300-line cap              |
| Markdown              | markdownlint                                                           |
| Documentation links   | Every relative link in a `.md` resolves                                |
| Format                | Prettier                                                               |
| Duplication           | jscpd, 2% threshold                                                    |
| Tests + coverage      | vitest, with thresholds                                                |
| Build                 | `next build`                                                           |
| Smoke test            | Boots the built app and exercises two auth modes                       |
| Dependency audit      | `npm audit --audit-level=high`                                         |
| Registry signatures   | `npm audit signatures` — what the lockfile resolved is what was signed |
| No hardcoded config   | Credential shapes and deployment-specific literals                     |
| Temporary file safety | A temp file at a path someone else could create first                  |
| Deep scan             | Trivy: secrets and misconfiguration in the tree                        |
| Secret history scan   | gitleaks, over history rather than the tree                            |

Beyond the gate, on their own schedules: CodeQL and Trivy on every push, Dependabot weekly, an image build and
scan, and mutation testing weekly.

## Why some of these exist

**Two secret scanners.** Trivy reads the working tree. A secret committed and later deleted passes it while
still sitting in history, which is where it can still be read. gitleaks reads history.

`.env.example` is skipped by gitleaks and guarded instead by `check-no-hardcoded-config.sh`, which rejects a
value on any key whose name says it holds a secret. That is the stricter rule: gitleaks would only object to a
value that looks secret.

**Temporary file safety.** A file created at a guessable name, in a directory everyone can write to, is one
someone can get to first — as a symlink pointing wherever they like, which the write then follows.
`mkdtempSync` returns a directory nobody can guess. CodeQL finds this too, but only after a push.

**Every action is pinned by commit SHA.** A tag is mutable: whoever takes over a maintainer account can
re-point `v7` at their own commit, which then runs here holding this repository's token. Dependabot updates a
digest as readily as a tag.

## Coverage

Thresholds are 93% lines, 92% functions and statements, 86% branches, measured across `packages/core`, the
route handlers, and `apps/web/lib`. Each sits just under what the suite holds, so the number ratchets with the
work rather than describing an ambition.

Branches trails the rest deliberately: v8 counts every `??`, `||` and default arm separately, including
combinations the code prevents. Closing the last few means writing tests for states that cannot occur, which is
how a threshold starts producing tests written for the number.

I/O shells are excluded — `git.ts`, `agents/manager.ts`, `sync.ts`, `push.ts`, `mcp/client.ts`,
`lib/setup-access.ts`. Their logic lives in tested modules; what remains is a call out to the world.

## Mutation testing

`npm run mutation`. Coverage says a line ran; it cannot say a test would have noticed if the line were wrong.
Stryker changes the code and reports which changes no test objected to. Every survivor is a missing assertion.

It runs weekly and on request, not in the gate — once per mutant is minutes where the gate is seconds. The
first full run scored **77%** against 95% line coverage, which is the gap the tool exists to show.

## What a pull request gets

A comment reporting what moved, whether tests came with it, coverage for each file the change touches, and
whether it crosses a checkpoint — a migration under `drizzle/`, a change to `.env.example`, a change to
`ci/checks.json`. It is built from the coverage the test run already produced, so the suite runs once.
