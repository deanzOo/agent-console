# Commit conventions

Commits are the input to the changelog. release-please reads every message on `main`, decides the version
bump, and writes `CHANGELOG.md` from the subjects. A vague subject becomes a vague release note that someone
reads six months from now while deciding whether to upgrade.

`commitlint` enforces the shape; the rest is the part a tool cannot check.

## Format

```text
<type>(<scope>): <subject>

<body — why, not what>

<footer — BREAKING CHANGE, Refs>
```

## Subject

- **Imperative mood**: "add", not "added" or "adds". It completes the sentence _"applied, this commit
  will…"_.
- **≤72 characters**, lower case, no trailing period.
- Say what changes **for a user of the thing**, not which files you touched.

| Instead of           | Write                                                            |
| -------------------- | ---------------------------------------------------------------- |
| `fix: bug`           | `fix(sse): resume from the last seq after a dropped connection`  |
| `feat: update db.ts` | `feat(db): enforce mission status with a CHECK constraint`       |
| `refactor: cleanup`  | `refactor(auth): extract cookie parsing shared by both adapters` |

## Types

Only these; `commitlint` rejects the rest.

| Type       | Use for                              | Version bump |
| ---------- | ------------------------------------ | ------------ |
| `feat`     | New capability a user can observe    | minor        |
| `fix`      | Corrects broken behaviour            | patch        |
| `perf`     | Faster or lighter, same behaviour    | patch        |
| `deps`     | Dependency version changes           | patch        |
| `refactor` | Internal change, no behaviour change | none         |
| `docs`     | Documentation only                   | none         |
| `test`     | Tests only                           | none         |
| `build`    | Build system, bundling, Docker       | none         |
| `ci`       | Workflows and CI config              | none         |
| `chore`    | Anything else with no user impact    | none         |
| `style`    | Formatting only                      | none         |
| `revert`   | Reverts a previous commit            | none         |

`refactor` through `style` are hidden from the changelog. If a change deserves to be read by someone
upgrading, it is a `feat`, `fix`, or `perf` — pick honestly rather than by how large the diff was.

## Scope

Optional, but use it. The subsystem, not the filename: `auth`, `db`, `agents`, `mcp`, `repos`, `notify`,
`config`, `setup`, `ui`, `deploy`.

## Body

Skip it when the subject is genuinely the whole story. Write one when the change involved a judgement.

The body answers **why**, not what — the diff already shows what. Worth including:

- The problem or constraint that forced this.
- What you rejected and why, if the obvious approach was wrong.
- A trap the next reader would otherwise fall into.

Wrap at 100 characters. From this repository's own history:

```text
feat(db): move persistence to drizzle orm with derived zod schemas

Row types now derive from the table definitions instead of being hand-written,
which removes the Object(row) casts the raw driver forced.

Drizzle's enum option is TypeScript-only and emits no DDL, so each one carries
an explicit CHECK — a test caught the database silently accepting an invalid
mission status after the port.
```

## Breaking changes

A `!` after the type, **and** a footer explaining the migration. This drives a major bump, so the footer is
the upgrade instructions:

```text
feat(config)!: rename WORKSPACE_DIR to WORKSPACE_ROOT

BREAKING CHANGE: WORKSPACE_DIR is no longer read. Rename it to WORKSPACE_ROOT
in your .env; boot fails with the old name rather than silently using a default.
```

## Rules

- **One logical change per commit.** If the subject needs an "and", split it.
- **No attribution trailers.** No `Co-Authored-By`, no tool credit — enforced by a commit-msg hook.
- **Never amend or force-push a commit already on `main`.** release-please has read it.
