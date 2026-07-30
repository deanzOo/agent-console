# CI checks

`checks.json` is the single source of truth for what must pass. Both sides read it:

- **Locally** — `npm run ci` (and the `pre-push` hook) runs every check in order.
- **Remotely** — `.github/workflows/ci.yml` builds its job matrix from this file with `fromJSON`.

So a check cannot exist in one place and not the other. That parity is the point: a check that only runs
remotely is one you discover after pushing, and a check that only runs locally is one that never blocks a
merge.

## Adding a check

Append an entry. Nothing else to edit.

| Field      | Meaning                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `id`       | Stable slug. Becomes the CI job name, so changing it means re-selecting required status checks. |
| `name`     | Human label in output.                                                                          |
| `command`  | Run from the repository root, in `bash`.                                                        |
| `requires` | Optional binary. Missing locally → reported as skipped, never silently passed. CI installs it.  |

## Not in the matrix

Two workflows stay separate because they are not pass/fail commands:

- **CodeQL** (`codeql.yml`) needs GitHub's build-and-analyse actions and uploads SARIF.
- **Commit linting** (the `commits` job) needs the PR's commit range, which only exists remotely.

Both are still required status checks on `main`.
