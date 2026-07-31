# Monorepo split

Local design doc. Not for commit onto a pushed branch.

## Context

Today everything is one npm package: a Next app at the root, with `lib/` and `config/` beside it. That is
the right shape for one deployable, and it stops being the right shape the moment a second consumer of the
core exists — a CLI, a worker, a second app, or a published client.

The split is worth doing **now, before that second consumer**, for one reason that is already true: the
boundary it would enforce is a boundary the code already respects, and enforcing it while that is still true
is cheap. Waiting means discovering the first violation after it has been depended on.

## The fact that makes this easy

**`lib/` imports nothing from `next` or `react`.** Verified across the whole directory. The core is already
framework-free — sessions, missions, auth adapters, the SQLite layer, the SSE formatter, the git and
worktree lifecycle — none of it knows it is being served by Next.

So this is not a refactor. It is moving files and making a rule that already holds mechanically enforceable.

The one exception is the `@/` alias, which currently resolves to the repo root and is used from `lib/` to
reach `config/`. That import direction survives the move intact if `config/` goes with the core.

## Target shape

```text
apps/
  web/                     the Next app — pages, route handlers, middleware, PWA assets
    app/  public/  middleware.ts  next.config.ts  Dockerfile
packages/
  core/                    everything framework-free
    agents/  auth/  mcp/   db.ts schema.ts missions.ts repos.ts git.ts
    notify.ts sse.ts settings.ts setup.ts
    env.ts                 (was config/env.ts) — zod-validated, still fails loud at boot
    features.ts            (was config/features.ts) — getFeatures()
ci/                        checks.json stays at the root: it describes the repo, not a package
scripts/                   likewise
docs/
turbo.json                 the pipeline (see "Why turbo arrives with the split")
```

Two packages, not five. `core` is one cohesive thing with one reason to change; splitting it further into
`db` / `agents` / `auth` would be three packages that always version together, which is cost with no benefit.
**Two call sites is a pattern; one is a guess** — split `core` again when a second consumer actually needs a
subset of it.

### Naming

`@agent-console/core`, `@agent-console/web`. Private (`"private": true`), never published — the scope exists
to make imports unambiguous, not to reserve a name on npm.

## What moves, and what deliberately does not

| Moves to `packages/core`              | Why                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `lib/**` except nothing               | Already framework-free, verified                                                            |
| `config/env.ts`, `config/features.ts` | `lib/` imports them; splitting them apart re-creates the coupling across a package boundary |

| Stays in `apps/web`                    | Why                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app/**`, `middleware.ts`, `public/**` | Next-specific by definition                                                                     |
| `Dockerfile`, `docker-compose.yml`     | They build and run _the app_, not the core                                                      |
| `lib/setup-access.ts`                  | Reads `next/headers` indirectly via the adapter and exists to serve two routes — app-layer glue |

| Stays at the repo root         | Why                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| `ci/checks.json`, `scripts/**` | They describe the repository's gate, not any one package                |
| `.env.example`                 | One deployment, one env file — the contract does not fragment           |
| `drizzle/**` migrations        | Generated from `core`'s schema but applied to the deployment's database |

## Why turbo arrives with the split, and not before

With one package there is nothing to order and the manifest is unambiguous. With two there is a real graph —
`web` cannot typecheck until `core`'s types exist — and that ordering has to be written down somewhere. That
somewhere should be **one** place.

So the manifest becomes the pipeline rather than sitting beside it:

- `turbo.json` declares task graph and inputs (`build` dependsOn `^build`, and so on).
- `ci/checks.json` keeps declaring _what the gate is_ and stays the single source the GitHub matrix reads.
  Its commands become `turbo run typecheck`, `turbo run test`, and so on.

That preserves the property that makes the manifest load-bearing — a check cannot exist locally and not
remotely — while letting turbo own ordering and caching, which is the thing it is actually good at. If
instead both files listed tasks independently, they could disagree silently, which is the objection that
kept turbo out until now.

## Sequencing

Each step ends green. No step leaves the tree unbuildable.

1. **Workspaces, no moves.** Add `"workspaces": ["apps/*", "packages/*"]`, create both package manifests,
   move nothing. Verify `npm ci` still resolves and the gate is green. This isolates tooling breakage from
   file-move breakage.
2. **Move `lib/` and `config/` into `packages/core` with `git mv`.** Keep history. Fix the `@/` alias:
   `core` gets a relative-import world of its own; `web` keeps `@/` pointing at itself and imports the core
   by package name. Nothing else changes.
3. **Move `app/`, `middleware.ts`, `public/` into `apps/web`.** Point `next.config.ts` and the Dockerfile at
   their new paths. The Docker build context becomes the repo root so the workspace resolves — that is the
   step most likely to bite, and the smoke test is what proves it did not.
4. **Introduce `turbo.json`**, rewrite `ci/checks.json` commands to `turbo run …`, confirm the local run and
   the GitHub matrix still agree leg for leg.
5. **Then** the optional-tooling work, against the settled manifest.

Steps 2 and 3 are each a single PR with no behaviour change — the diff should be almost entirely renames,
and a reviewer should be able to confirm that by the file list alone.

## Risks, and what catches each

- **Docker build context.** A workspace install needs the root lockfile; a `Dockerfile` that copies only
  `apps/web` silently produces an image missing `core`. Caught by the smoke test, which boots the built
  image and asks it for a page — the check that already caught two runtime-only failures.
- **Coverage thresholds are configured per-path** (`lib/**`, `config/**`). Those globs change with the move,
  and a wrong glob measures nothing while reporting 100%. Assert the covered-file _count_ does not drop
  across the move.
- **`@/` alias ambiguity.** Two packages both wanting `@/` is how imports start resolving to the wrong file.
  `core` uses relative imports internally; only `web` keeps `@/`.
- **The 300-line cap and jscpd** run over new paths; confirm the configs follow rather than silently
  covering nothing.

## Verification

- `npm run ci` green at every step, including the smoke test's two auth-mode legs.
- The built image still serves: `/login` 200, `/api/missions` 401 unauthenticated, `/setup` 200 unconfigured.
- A real mission still runs end to end — the approval fires, allow continues it, deny stops it. Unit tests
  cannot see that path; only a real run can.
- `git log --follow` on a moved file still shows its history.
- `packages/core` has no `next` or `react` in its `package.json` and no import of either. This is the rule
  the split exists to enforce, so it is worth a grep in the gate rather than trusting review.

## Out of scope, noted

`lib/validation.ts` exports three drizzle-zod schemas and **has no importers anywhere outside its own test.**
It is either dead or an unfinished intention. Deciding that is not part of a move, so it gets an
`out-of-scope` issue rather than a quiet deletion mid-split — but it should not be carried into a new package
without an answer.
