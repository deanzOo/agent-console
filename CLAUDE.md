# CLAUDE.md — repo conventions

Rules for anyone (human or agent) working in this repo. Project rules here override global defaults.

## What this is

A self-hosted control panel for Claude Code agents. It runs on the operator's own server, hosts long-running
agent sessions ("missions"), streams what they're doing, and lets the operator answer approval prompts from a
phone. It also lists GitHub issues and Asana tasks and launches missions from them.

**It ships to strangers.** Anyone clones it onto their own box with their own credentials. Every rule below
about configuration follows from that.

---

## Non-negotiables

### 1. TDD — failing test first, always

Write the test, watch it fail for the right reason, then write the implementation. Not "write code then add
a test." The order is the point: a test written after the code tends to assert what the code happens to do
rather than what it should do.

The loop:

1. Write one failing test that names the behavior. Run it. Confirm it fails **because the behavior is
   missing**, not because of a typo or a bad import.
2. Write the least code that makes it pass.
3. Refactor with the test green.
4. Commit.

Applies to every feature and every bugfix. A bugfix starts with a test that reproduces the bug.

Coverage thresholds (90% lines/functions/statements, 85% branches on `lib/`, `config/`, `middleware.ts`) are
a **backstop**, not the rule. Coverage cannot tell whether a test was written first. Hitting the number with
tests bolted on afterwards is a violation even though CI is green.

Exempt: pure markup with no logic (pages, layouts), type-only files, config literals. If you find yourself
arguing that some logic is too simple to test, it is probably simple enough to test in three lines.

### 2. Configuration, never hardcoding

No value tied to one deployment appears in source. Precedence is **env var → `settings` table → default**.

- Startup-critical values: env vars, parsed once in `config/env.ts` with zod. Boot must fail loudly and
  name the missing key.
- Runtime-changeable values (tokens, chat IDs, intervals, concurrency cap, default base branch): the
  `settings` table, editable from `/setup` and `/settings`.
- Every key documented in `.env.example`. That file is the contract.

`scripts/check-no-hardcoded-config.sh` runs in CI and fails the build on tokens, absolute home paths, and
personal hostnames outside `.env.example` and docs. If you need to add a pattern, add it there.

### 3. Every integration is optional and degrades

No GitHub token → issues panel absent. No Asana token → tasks panel absent. No VAPID keys → no push button.
The core loop (missions, transcript, approvals) requires only an Anthropic credential and git.

Feature availability comes from one `getFeatures()` helper, read by both the nav and the API routes. A route
for a disabled feature returns 404. It must never throw from an undefined client — a missing optional
integration is a supported state, not an error.

### 4. Single process

Agent sessions live in process memory. The app runs as one long-lived `next start`. No serverless, no
clustering, no multiple workers. Anything that assumes it can be horizontally scaled is a bug.

### 5. Secrets

Never in source, never in a log line, never in an agent's prompt or memory file, never in a `settings` value
that gets rendered back to the client. `data.db` is `chmod 600`. Trivy's secret scanner runs in CI, but
don't rely on it to catch what review should.

---

## Type rigor

- No `any`. No `as` assertions — `@typescript-eslint/consistent-type-assertions` is set to `never` and will
  fail the build. `unknown` is the last resort, only at a real trust boundary (parsing external input).
- Fix the type system, not the call site. If a type doesn't line up, walk back to where the information was
  lost and restore it there.
- Derive types (`z.infer`, `typeof`, schema `.shape`). Don't hand-write a parallel `interface` that can drift
  from the schema it mirrors.
- An "impossible" null check on already-narrowed state means the type is wrong.
- No `@ts-ignore` / `@ts-expect-error`. If a dependency's types are genuinely wrong, wrap it once in a typed
  adapter module and note why.

## Root cause, no papering over

- No swallowed `try {} catch {}`.
- No `eslint-disable` or `jscpd:ignore`. If a suppression is genuinely correct, raise it in review with what
  you found and why — never silently.
- No sleep-or-retry to dodge a race. Find the actual ordering problem.
- Every bug is a class. Before calling one fixed, grep for the _pattern_ and fix every instance in the same
  pass. Add the failing-first regression test.

---

## The gate

`npm run verify` runs typecheck, lint, format check, duplication check, and tests with coverage. It must be
green before you push. CI runs the same set plus `build` and the hardcoded-config scan.

| Command                 | What it gates                                                              |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm run typecheck`     | `tsc --noEmit`, strict, `noUncheckedIndexedAccess`                         |
| `npm run lint`          | ESLint — no `any`, no assertions, no unused                                |
| `npm run format:check`  | Prettier. Formatting is not a review topic                                 |
| `npm run dupes`         | jscpd, 2% threshold. Tests excluded — duplication there is usually clarity |
| `npm run test:coverage` | vitest + thresholds                                                        |
| `npm run verify`        | all of the above, one command                                              |

Pre-commit runs prettier + eslint on staged files. Commit-msg runs commitlint.

## Commits, branches, releases

- **Conventional Commits, enforced by commitlint.** This is load-bearing: release-please derives the version
  bump and CHANGELOG from commit types. A malformed subject silently drops a change out of the release notes.
- Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`, `deps`.
  Subject ≤72 chars, imperative, no trailing period.
- No co-author trailer.
- Small, frequent commits — one logical unit each.
- Work happens on a branch in a git worktree, never directly on `main`. Baseline the green gate on the
  untouched base branch _before_ writing code, so you know which failures you introduced.
- Push to `main` requires explicit approval. Everything else is fine to push.
- PR only once CI is fully green. Never open one on red, skipped, or unrun tests.

## Dependencies and security

- Dependabot runs weekly, grouped by risk class; majors come as their own PR.
- Trivy scans deps, secrets, and IaC — fails on HIGH/CRITICAL, full inventory to code scanning.
- CodeQL runs `security-and-quality` on every PR.
- Before adding a dependency: does the stdlib or an already-installed package do it? A few lines beat a new
  supply-chain edge.

---

## Codebase map

```
app/            routes — pages and route handlers (thin; logic lives in lib/)
config/         env.ts (zod-validated env), features.ts (getFeatures)
lib/agents/     session manager — the core. query(), canUseTool parking, SSE fan-out
lib/auth/       adapter per AUTH_MODE: cloudflare-access | password | trusted-network
lib/mcp/        stdio MCP clients (asana, github), lazily spawned, restart with backoff
lib/repos.ts    bare clone + worktree-per-mission lifecycle
lib/notify.ts   web-push + telegram, both best-effort
lib/db.ts       better-sqlite3 singleton, migrations on boot
deploy/         install.sh + systemd/cloudflared templates
scripts/        CI helpers
```

**Route handlers stay thin.** They validate input, call a `lib/` function, and shape the response. Business
logic in a route handler can't be unit tested without HTTP, which makes it hard to TDD — that's the tell.

### Adding an integration

1. Add its env keys to `.env.example` and `config/env.ts` as **optional**.
2. Add a flag to `getFeatures()`.
3. Gate the nav entry and the route on that flag; route returns 404 when off.
4. Add a live validation step to `/setup` that actually calls the service.
5. Test the unconfigured path first — that's the one that breaks for the peer who doesn't use it.

## graphify

This repo maintains a code knowledge graph at `graphify-out/graph.json` so agents can answer structural
questions without grepping the whole tree.

- **Query before exploring.** `graphify query "..."` for anything about architecture, call paths, or where a
  thing lives.
- **Refresh after changing code:** `npm run graph:update` (incremental, cheap). Build from scratch with
  `npm run graph`.
- **Code only.** Never send docs, configs, or images to an external model — build stays local (AST /
  tree-sitter). If a `GEMINI_API_KEY` or `GOOGLE_API_KEY` is present, still skip semantic egress.
- `graphify-out/` is gitignored. The graph is a local artifact, never committed.

## Writing style

### Comments are a last resort

Assume a comment is a defect until proven otherwise. In ~99% of cases expressive names and small functions
carry the meaning, and a comment is a sign the code should have been clearer instead. Rewrite first.

Write one only when the _why_ is genuinely unrecoverable from the code — a non-obvious constraint, a
workaround for external behaviour, a security reason a check exists. Keep it to one line. Never narrate what
the next line does, restate a signature, or label a section.

```ts
// no — the code already says this
// Read the cookie header and split it
const header = request.headers.get("cookie");

// yes — the constraint is invisible in the code
// timingSafeEqual throws on a length mismatch, so reject short input first.
```

No file-header block comments, no banner separators, no TSDoc on internal functions.

### File size

Hard cap of **300 lines** per source file (blank lines and comments excluded), enforced by ESLint's
`max-lines`. Tests get 500 — enumerating cases is their job. 300 is ESLint's own default and where most
style guides land; a file past it is doing more than one job, so split it rather than raising the cap.

### General

- Match the surrounding code: its naming, its idiom, its comment density.
- Build what the task needs now. No speculative abstraction, no config for a value that never changes, no
  interface with one implementation.
- Surgical edits. No drive-by refactors or reformatting of untouched code. If broad cleanup looks worthwhile,
  propose it and wait.
- Spot a bug outside the current task? Don't fix it inline — open a GitHub issue labelled `out-of-scope` with
  the date, location, what's wrong, and why it matters.
