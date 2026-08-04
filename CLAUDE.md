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

Coverage thresholds (93% lines, 92% functions and statements, 86% branches across `packages/core`, the
route handlers and `apps/web/lib`) are
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

## Schemas: Drizzle owns tables, zod owns boundaries

One source of truth per concern, and never a hand-written type that mirrors another.

| Concern                                                          | Owner                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Table shape, migrations, row types                               | Drizzle (`lib/schema.ts`) — `$inferSelect` / `$inferInsert`   |
| Insert/update validation                                         | `drizzle-zod` (`lib/validation.ts`) — derived from the tables |
| Request bodies, external API responses, JSON inside TEXT columns | Hand-written zod                                              |
| Environment variables                                            | zod (`config/env.ts`)                                         |

- **Never hand-write a zod schema that mirrors a table.** Use `createInsertSchema` / `createSelectSchema`.
- **Drizzle's `enum` option is TypeScript-only** and emits no DDL. Every one needs a matching `check()`
  constraint, or the database will accept values the types forbid. Use `sql.raw` for the literals —
  bound parameters do not survive into DDL.
- Schema changes go through `npm run db:generate`, and the generated SQL is reviewed and committed. Never
  hand-edit a file under `drizzle/`.

## No magic numbers or strings

Every literal that carries meaning gets a named constant, defined **once**, and imported everywhere it is
needed. If the same value appears in two files, one of them is wrong — find the source of truth or create it.

```ts
// no
if (secret.length < 32) …
setTimeout(flush, 25_000);
if (row.status === "awaiting_input") …

// yes
if (secret.length < MIN_SESSION_SECRET_LENGTH) …
setTimeout(flush, HEARTBEAT_MS);
if (row.status === MISSION_STATUS.AWAITING_INPUT) …
```

Where the constant lives:

- A value the database also constrains → derive it from the schema (`MISSION_STATUSES`), never retype it.
- A value crossing the client/server boundary (cookie names, event types, header names) → one shared module,
  imported by both sides. A string typed twice will drift, and the failure is silent.
- A tuning knob (timeouts, limits, thresholds) → a named constant at the top of the module that owns it, or
  config if a deployment should be able to change it.

Exempt: `0`, `1`, `-1`, and `""` used as arithmetic or emptiness, and a literal used exactly once inside the
function that defines its meaning. If you need a comment to explain what a number means, it needed a name.

## Abstract at the seams

**This codebase should read like one person decided how things work here — not like a guided tour of its
dependencies.** A reader should be able to follow `lib/` without knowing Drizzle's query builder, the Agent
SDK's message union, or how `web-push` reports a dead subscription. Those are implementation details of
_their_ authors' opinions about what an API should look like, and every one that leaks into our code is a
second dialect the next reader has to learn.

So: **wrap third-party surfaces in our own vocabulary at the boundary.** One module owns the dependency and
speaks its language; everything inside speaks ours.

Already in place, and the pattern to copy:

| Our word                   | Their surface it hides                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `AgentDriver` / `AgentRun` | the Agent SDK's `query()`, its option bag, its message union              |
| `AuthAdapter.getUser()`    | JWKS verification, cookie parsing, scrypt, three unrelated auth models    |
| `Deliverer.send()`         | `web-push`'s VAPID setup and status-code semantics, Telegram's HTTP shape |
| `Db`                       | Drizzle's generic type, so call sites never spell it                      |
| `StoredEvent`              | a row with a `payload_json` column                                        |

The test that tells you it is working: **can you change the library without touching anything but the one
module that owns it?** If swapping the notifier means editing six files, the abstraction is not there yet.
It is also why the mission loop is testable at all — `AgentDriver` is what lets the whole thing run against
a fake with no model involved.

### Where not to

This is not a licence to layer. An abstraction earns its place when it marks a **seam** — a boundary to a
third party, the OS, the network, or the clock. It does not earn its place merely for existing.

- **Don't wrap what is already our vocabulary.** zod _is_ how we describe external data; a `Validator`
  interface over it buys nothing. Same for React.
- **Don't add an interface inside the domain because there might be a second implementation one day.** There
  won't be, and if there is, add it then.
- **Don't build a generic when you have one case.** Two call sites is a pattern; one is a guess.
- **Don't rename for the sake of it.** A wrapper that forwards a call unchanged and adds only a new name is
  cost with no benefit — that is indirection, not abstraction.

The line: an interface with one implementation is _right_ when it hides a third-party surface or makes the
thing testable, and _wrong_ when it is scaffolding for an imagined future. `AgentDriver` has one real
implementation and earns it on both counts. A `MissionServiceInterface` would have one implementation and
earn neither.

## Follow the existing pattern

Before writing something new, look for how this codebase already does it, and do that. Consistency is worth
more than your improvement, because the next reader — human or agent — learns one pattern instead of five.

Concretely:

- Reading a cookie? `lib/auth/cookies.ts` exists. A new inline parser is a bug waiting to diverge.
- Adding a table? Follow `lib/schema.ts`: enum plus matching `check()`, types derived, never hand-written.
- Adding a route? Copy the shape of an existing one — zod at the boundary, thin handler, logic in `lib/`.
- Adding an integration? Follow the sequence in "Adding an integration" below; do not invent a new gating
  mechanism alongside `getFeatures()`.
- Adding an I/O module? Split pure logic from the shell the way `repos.ts` and `git.ts` are split, so the
  logic stays testable.

If the existing pattern is genuinely wrong for the new case, say so and change it **everywhere** in the same
pass — one pattern, migrated. What is not acceptable is a second pattern living next to the first, because
then every future reader has to guess which one is current.

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

**`npm run ci` runs everything CI runs, locally.** It must be green before you push — the `pre-push` hook
runs it for you.

The check list lives in **[`ci/checks.json`](ci/checks.json)**, and both sides read it: the local script
iterates it, and the GitHub matrix is built from it with `fromJSON`. A check therefore cannot exist in one
place and not the other. **Add a check there and nowhere else.**

| Check                 | What it gates                                                              |
| --------------------- | -------------------------------------------------------------------------- |
| Typecheck             | `tsc --noEmit`, strict, `noUncheckedIndexedAccess`                         |
| Lint                  | ESLint — no `any`, no assertions, no unused, 300-line cap                  |
| Markdown              | markdownlint                                                               |
| Documentation links   | Every relative link in a `.md` resolves                                    |
| Format                | Prettier. Formatting is not a review topic                                 |
| Duplication           | jscpd, 2% threshold. Tests excluded — duplication there is usually clarity |
| Tests + coverage      | vitest + thresholds                                                        |
| Build                 | `next build`                                                               |
| Dependency audit      | `npm audit --audit-level=high`                                             |
| No hardcoded config   | Rejects credential shapes and deployment-specific literals                 |
| Temporary file safety | Rejects a temp file at a path someone else could create first              |
| Deep scan             | Trivy: secrets and IaC misconfiguration                                    |
| Secret history scan   | gitleaks over the whole history, not just the tree                         |

Hooks are convenience, not the boundary — `--no-verify` skips them, so everything runs again in CI.

### Mutation testing answers what coverage cannot

Coverage says a line ran. It cannot say a test would have noticed if the line were wrong. `npm run mutation`
changes the code — flips a comparison, empties a string, drops a call — and reports which changes no test
objected to. Every survivor is a line the suite executes without asserting anything about.

It runs weekly and on request rather than in the gate: it runs the suite once per mutant, so it costs minutes
where the gate costs seconds. Treat a survivor as a missing assertion, not as a line to delete.

**Remotely, the suite runs only on pushes to `main` and PRs whose base is `main`.** A stacked PR onto
another feature branch runs nothing, so the whole stack costs one run instead of one per branch. Until a
branch is proposed to `main`, `npm run ci` and the `pre-push` hook are the only signal — which is the reason
local parity is a rule and not a nicety.

### Tooling must come from `node_modules`

Anything a contributor needs should arrive with `npm ci`. If you reach for a tool, check for an npm-installable
equivalent first and prefer it, even if it is slightly less capable — a check nobody can run locally is a
check that only fails after a push.

**Host-installed tooling, complete list:**

| Tool                            | Needed for                                | Without it                                                                          |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Node 22+, npm                   | Everything                                | Nothing works                                                                       |
| git                             | The product itself — clones and worktrees | Nothing works                                                                       |
| [trivy](https://trivy.dev)      | The secret and IaC deep scan              | That one check is **skipped locally with a notice**; CI still runs it on every push |
| [gitleaks](https://gitleaks.io) | The secret history scan                   | That one check is **skipped locally with a notice**; CI still runs it on every push |

That is the whole list, and it should stay that way. Everything else — ESLint, Prettier, vitest, jscpd,
markdownlint, the link checker, commitlint, drizzle-kit — is a dev dependency.

If you add a check needing a host binary, give its manifest entry a `requires` and an `installHint`, so a
contributor without it sees what to install rather than a confusing failure. Never let a missing tool
silently pass.

## Commits, branches, releases

Full convention with examples: **[docs/reference/commit-conventions.md](docs/reference/commit-conventions.md)**.
The short version:

- **Conventional Commits, enforced by commitlint.** Load-bearing: release-please derives the version bump and
  CHANGELOG from commit types. A vague subject becomes a vague release note.
- Subject ≤72 chars, imperative, lower case, no trailing period. Say what changes for a _user_, not which
  files you touched.
- Body is for **why** — the constraint, the rejected alternative, the trap. Skip it when the subject is the
  whole story.
- **No attribution trailers of any kind.** No `Co-Authored-By`, no tool credit. Enforced by a commit-msg hook.
- Small, frequent commits — one logical unit each. If the subject needs an "and", split it.
- Never amend or force-push a commit already on `main`; release-please has read it.

### `main` is protected — everything lands via PR

Never push directly to `main` (or `master`, `dev`, `staging`, `prod`). A `pre-push` hook refuses it locally,
and GitHub branch protection is the real enforcement — see
[docs/how-to/repository-setup.md](docs/how-to/repository-setup.md).

```bash
git switch -c feat/mission-transcript
# work, commit
npm run verify
git push -u origin HEAD && gh pr create
```

Merge only when CI is fully green. Never on red, skipped, or unrun tests. Rebase onto the latest `main` and
let CI pass again before merging, so nothing merges on a stale base.

Hooks are a convenience, not the boundary: `--no-verify` skips them, which is why commit linting, trailer
checks, and the full gate all run again in CI.

- Work happens on a branch in a git worktree, never directly on `main`. Baseline the green gate on the
  untouched base branch _before_ writing code, so you know which failures you introduced.
- Push to `main` requires explicit approval. Everything else is fine to push.
- PR only once CI is fully green. Never open one on red, skipped, or unrun tests.

## Dependencies and security

- Dependabot runs weekly. Minor and patch updates are grouped by risk class; a major matches no group, so it
  arrives as its own pull request and gets a review of its own.
- Trivy scans deps, secrets, and IaC — fails on HIGH/CRITICAL, full inventory to code scanning.
- CodeQL runs `security-and-quality` on every PR.
- Before adding a dependency: does the stdlib or an already-installed package do it? A few lines beat a new
  supply-chain edge.

---

## Codebase map

```text
apps/web/            the console. Pages, route handlers, auth middleware, PWA assets
  app/               routes — thin; logic lives in packages/core
  lib/agentd.ts      the only module that knows agentd is reached over HTTP
apps/agentd/         the session host. Owns live runs so restarting the UI cannot kill them
  server.ts          node:http + SSE on loopback; routes.ts is the testable half
packages/core/       framework-free. Imports neither next nor react, and must not start
  agents/            sessions: query(), the parked permission promise, SSE fan-out
  auth/              adapter per AUTH_MODE: cloudflare-access | password | trusted-network
  mcp/               stdio MCP clients (asana, github), lazily spawned, restart with backoff
  repos.ts git.ts    bare clone + worktree-per-mission lifecycle
  notify.ts          web-push + telegram, both best-effort
  db.ts              better-sqlite3 singleton
  env.ts features.ts zod-validated env; getFeatures()
deploy/              install.sh + systemd/cloudflared templates
scripts/             CI helpers
ci/checks.json       the gate, read by both the local runner and the GitHub matrix
```

**Route handlers stay thin.** They validate input, call into `packages/core` or `agentd`, and shape the
response. Business logic in a route handler can't be unit tested without HTTP, which makes it hard to
TDD — that's the tell.

**The web app holds no session state.** Live runs belong to `agentd`, which is the entire point: deploying
the UI must not kill a mission that is mid-flight. A route handler that caches anything about a running
mission puts that back.

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
- **Refresh after changing code:** `npm run graph:update` (incremental, cheap). `npm run graph` forces a
  full re-extract. Both use `graphify update`, which is AST-only — plain `graphify .` runs semantic
  extraction and ships file contents to an external model, which this repo does not do.
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
- Build what the task needs now. No speculative abstraction, no config for a value that never changes. An
  interface with one implementation is right at a seam and wrong in the middle — see "Abstract at the seams".
- Surgical edits. No drive-by refactors or reformatting of untouched code. If broad cleanup looks worthwhile,
  propose it and wait.
- Spot a bug outside the current task? Don't fix it inline — open a GitHub issue labelled `out-of-scope` with
  the date, location, what's wrong, and why it matters.
