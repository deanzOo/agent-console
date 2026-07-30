# Contributing

## Setup

```bash
npm ci
cp .env.example .env      # AUTH_MODE=trusted-network is easiest locally
npm run dev
```

Everything you need to develop and to run the checks arrives with `npm ci`. The only things you must install
yourself are **Node 22+**, **git**, and — optionally — [**trivy**](https://trivy.dev) for the secret and IaC
deep scan. Without trivy that one check reports itself as skipped and CI still runs it; nothing else is
affected. Full rationale in [CLAUDE.md](CLAUDE.md#tooling-must-come-from-node_modules).

## The loop

1. Branch off `main`.
2. **Write a failing test first.** Run it, and confirm it fails because the behaviour is missing — not
   because of a typo. This is not negotiable here; see [CLAUDE.md](CLAUDE.md).
3. Write the least code that passes it.
4. `npm run verify` — typecheck, lint, format, duplication, tests with coverage. One command, and it must be
   green before you push.
5. Commit in [Conventional Commits](https://www.conventionalcommits.org/) form. `commitlint` enforces it, and
   release-please derives the changelog from it — a malformed subject drops your change out of the notes.

## What reviewers will push back on

- Code without a test that came first.
- A value tied to one deployment hardcoded in source. It goes in config; CI scans for this.
- An integration that throws when unconfigured instead of hiding itself.
- `any`, an `as` assertion, or a `@ts-expect-error`.
- A comment restating what the code says. Comments are for a _why_ the code cannot carry, one line.
- A source file over 300 lines. Split it.
- A hand-written type mirroring a Drizzle table or a zod schema. Derive it.

Full conventions, with reasoning: **[CLAUDE.md](CLAUDE.md)**.

## Architecture decisions

A choice with lasting consequences gets an ADR in [`docs/adr/`](docs/adr/), in
[MADR](https://adr.github.io/madr/) form. Accepted records are immutable — supersede, never rewrite.

## Documentation

Docs follow [Diátaxis](https://diataxis.fr); see [`docs/README.md`](docs/README.md) for which directory your
change belongs in. New setting → the reference page _and_ `.env.example`.
