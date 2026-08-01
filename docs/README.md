# Documentation

Organised by [Diátaxis](https://diataxis.fr) — four kinds of document, split by what the reader is doing.
Keeping them apart is the whole point: a tutorial that stops to explain architecture loses the beginner, and
a reference that tells a story is useless for lookup.

| Directory      | For a reader who is…                 | Written as                                                                            |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `tutorial/`    | learning, and has never used this    | A lesson with a guaranteed outcome. No choices, no alternatives.                      |
| `how-to/`      | trying to accomplish a specific task | A recipe. Assumes competence, states the goal in the title.                           |
| `reference/`   | looking something up mid-task        | A map. Complete, factual, no instruction.                                             |
| `explanation/` | trying to understand why             | Discussion. Context, alternatives, trade-offs.                                        |
| `adr/`         | asking why a decision was made       | One [MADR](https://adr.github.io/madr/) record per decision, immutable once accepted. |

## When you change something

- New environment variable or setting → `reference/configuration.md` **and** `.env.example`.
- New API route → [`reference/api.md`](reference/api.md).
- New check in the gate → `ci/checks.json` **and** [`reference/checks.md`](reference/checks.md).
- New deployment step → the relevant `how-to/` guide.
- A decision with a lasting consequence → a new ADR. Never edit an accepted one; supersede it.

Docs are checked in CI: markdown lint plus a link checker. A broken relative link fails the build.
