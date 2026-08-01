# 8. The agent holds the git token

- Status: accepted
- Date: 2026-08-01

## Context and problem statement

Six missions in a row finished their work, committed to a branch, and stopped. Their closing messages all said
the same thing: no `gh auth`, no `GITHUB_TOKEN`, no SSH key, no credential helper. The work sat in worktrees on
the server with no way out.

`.env.example` had promised from the first commit that the GitHub token "lets agents push branches and open
PRs". The code never handed it over. Separately, the workspace builder read `config.githubToken` — the
environment variable alone — so a deployment configured through `/setup`, where the token goes to the settings
table, cloned anonymously as well.

The question is not whether agents need to reach GitHub. It is who holds the credential when they do.

## Considered options

1. **The console pushes and opens the pull request; the agent never holds a credential.** The agent commits;
   when it finishes, the app pushes the branch and opens the pull request through the API with the token it
   already has.
2. **Hand the token to the agent** as `GH_TOKEN`, with a git credential helper alongside it.
3. **A deploy key per box**, generated during setup and added to GitHub by the operator.

## Decision

Option 2, chosen by the operator with the trade-off stated.

The token reaches the agent through its environment. Git authenticates through a `GIT_CONFIG_*` credential
helper, which was picked for two properties: nothing is written to disk, so the credential lives only as long
as the session; and the helper reads `$GH_TOKEN` at the moment git asks rather than embedding it, so the token
never appears in a config value that trace output or a config dump would echo back.

Both paths — the clone and the agent — now resolve the token the way the rest of the app does, through
`resolveCredentials`, so a token set in `/setup` works exactly like one set in the environment.

## Consequences

**An agent has a shell, so anything it runs can read this token.** That is inherent to the option, not an
oversight in it. `.env.example` says so, and says to scope the PAT to the repositories you are willing to have
an agent write to.

Option 1 is the stronger position and remains available: the credential would stay in the process the operator
controls, and an agent that goes wrong could not push anywhere. It was rejected on cost — it is several times
the code, and `gh` stops working inside the mission, which is what agents reach for when asked to open a pull
request.

Option 3 was rejected as friction for someone cloning this onto their own box, for a narrowing of scope that a
fine-grained PAT already provides.

A mission that ends without pushing — out of turns, stopped, or from before this decision — is not stranded:
the console can push its branch and open the pull request on its behalf, which needs no session and works long
after the agent is gone.
