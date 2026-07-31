# Optional tooling — opt-in / opt-out

Local design doc. Not for commit onto a pushed branch.

## Context

The repo ships to strangers. Every _integration_ already degrades — no GitHub token, no issues panel —
because `getFeatures()` makes absence a supported state rather than an error. **Developer tooling has no
equivalent.** A peer who clones this inherits whatever the author decided: a reviewer, a graph builder, a
twelve-leg gate.

Today agy is invisible to the repo — it lives in the author's global hooks — so a peer gets none of it. That
is accidentally correct and deliberately nothing. The moment any of it moves in-repo, a peer who does not
want it has no way to say so except editing source, which is exactly what "configuration, never hardcoding"
exists to prevent.

The goal: **one declaration of what tooling exists, one place a peer says no, and never a silent skip.**

## What already works, and should not be reinvented

`ci/checks.json` entries take `requires` (a host binary) and `installHint`. `scripts/ci-local.sh` skips a
check whose binary is absent, prints the hint in yellow, and lists it under "Skipped locally". The GitHub
matrix is built from the same file with `fromJSON`.

So for anything gated on a **host binary, opt-out already exists: don't install it.** Trivy proves it.

Two gaps:

1. **npm devDependencies are always present**, so `requires` cannot express "I don't want this one".
2. **Intent is invisible.** A skipped trivy and a deliberately-declined trivy look identical. A peer cannot
   tell whether they broke something or chose something.

## Design

### 1. `optional` on a check

```json
{
  "id": "vulnerabilities",
  "name": "Deep scan (secrets, IaC)",
  "command": "trivy fs …",
  "requires": "trivy",
  "installHint": "brew install trivy — or opt out: see docs/how-to/optional-tooling.md",
  "optional": true
}
```

`optional: true` means _a deployment may decline this check entirely_. Absent or `false` means the check is
part of the floor and cannot be turned off — typecheck, lint, tests, build stay mandatory. This is the whole
schema change.

### 2. `ci/checks.local.json` — the peer's answer, gitignored

```json
{ "disabled": ["vulnerabilities", "review"] }
```

- Read by `scripts/ci-local.sh`. Ignored entirely if absent.
- **Gitignored**, so a peer's choice never travels and never appears in a PR.
- Disabling a check that is not `optional` is a hard error naming the check — not a silent pass. The floor
  is the floor.

`CHECKS_SKIP=review npm run ci` does the same for one run, for the case where you are mid-loop and know
exactly what you are skipping.

### 3. CI, without weakening the shared gate

`checks.local.json` is never read in CI — a local choice must not be able to weaken the branch that other
people merge into. A **fork** still needs to decline something the upstream requires, so the matrix filters
on a repository variable:

```yaml
checks=$(jq -c --arg d "${{ vars.DISABLED_CHECKS }}" '
[ .[] | select((.optional == true and (($d | split(",")) | index(.id))) | not) ]
' ci/checks.json)
```

`vars.DISABLED_CHECKS` is a GitHub repo variable — settable in a fork's own settings, no code change, no
divergence to rebase. Unset upstream, so upstream runs everything.

The job that prints the summary lists what was excluded and why. **A check that was declined is announced;
it is never merely absent.**

### 4. Tools that are not checks

agy is a _workflow_, not a gate — a review loop before a push. **Decided: it ships in the repo, on by
default**, behind the same switch a peer uses to decline it.

- `scripts/review.sh` — the loop, `requires: agy`.
- One entry in `ci/checks.json` with `"optional": true`, so it participates in the same declaration and the
  same opt-out. Declining it is `{"disabled": ["review"]}` or simply not installing agy.
- The `PreToolUse` gate stays **out of the repo**. A hook that blocks a peer's push is not ours to install;
  document it in `docs/how-to/optional-tooling.md` as something they may wire into their own settings.

graphify follows the same shape: `requires: graphify`, optional, already gitignored output.

### 4a. The reviewer's instructions are a file, and the file is replaceable

Shipping the loop on by default means shipping an opinion about what a review is. A peer's standards are
theirs, so the opinion lives in markdown rather than in the script.

`ci/review/prompt.md` — committed, the default reviewer: the persona, what to hunt for, what not to report,
what each severity means. Precedence when the loop runs:

1. `REVIEW_PROMPT_FILE=/path/to/mine.md` — one run, or a peer's own path in their shell profile.
2. `ci/review/prompt.local.md` — gitignored, so a peer's standing preference never travels.
3. `ci/review/prompt.md` — the shipped default.

Full replacement, not merging. A half-overridden prompt is two authors arguing inside one instruction, and
which one wins is unpredictable.

**Two things stay in code and are deliberately not overridable:**

- **The JSON schema** (`verdict`, `findings[]`, `severity`). The loop parses it and gates on
  `severity: "blocking"`. A prompt that changed the shape would not produce a different review; it would
  produce an unparseable one, and the gate would fail open or fail confusingly.
- **Inlining the project's own rules.** `CLAUDE.md`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md` are fed in
  and marked binding regardless of which prompt is in force. A repo's own rules are not the reviewer's
  opinion to discard — that is the part every reviewer must uphold.

So: **persona and emphasis are yours; the contract and the repo's rules are not.**

### 5. Documentation

`docs/how-to/optional-tooling.md` — the contract, listing every optional tool, what it costs, what you lose
by declining, and the two ways to decline. `.env.example` is the precedent: the file _is_ the contract.

## What this deliberately does not do

- **No plugin system.** A tool is a command plus a binary it needs. Anything more is scaffolding for an
  imagined future.
- **No per-tool config surface.** Tools read their own config; this only decides whether they run.
- **No opt-out for the floor.** Typecheck, lint, tests, build, format are not optional. A project where
  those are negotiable has no gate at all.

## Verification

- A peer with no trivy and no agy runs `npm run ci` and gets a green run with two yellow skip lines that
  name both, and a pointer to the doc.
- `{"disabled": ["typecheck"]}` fails immediately, naming typecheck as non-optional.
- `vars.DISABLED_CHECKS=vulnerabilities` on a fork drops exactly that leg from the matrix and says so in the
  summary; unset upstream, the full matrix runs.
- `ci/checks.local.json` appears in no `git status` and no PR diff.
- Deleting `checks.local.json` restores the full local run with no other change.

## Decisions

1. **The review loop ships in the repo, on by default**, with its instructions in a markdown file a peer can
   replace wholesale (§4a). The schema and the inlining of the repo's own rules stay in code.
2. **`optional` defaults to false.** A new check is part of the floor unless someone argues otherwise — a
   check nobody is required to run becomes a check nobody runs.
3. **This lands after the monorepo split**, so the manifest is designed once, as turbo's pipeline, rather
   than twice. See `2026-07-31-monorepo-split-design.md`.
