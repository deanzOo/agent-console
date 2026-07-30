# 3. One git worktree per mission, from a bare clone

- Status: accepted
- Date: 2026-07-30

## Context and problem statement

Several missions can run at once, and more than one may target the same repository. Each needs a working
directory it controls and a branch of its own.

## Considered options

- Bare clone per repository, one worktree per mission
- One ordinary clone per repository, agents switch branches
- A container per mission

## Decision

`$WORKSPACE_ROOT/repos/<repo>.git` as a bare clone, and `$WORKSPACE_ROOT/wt/<missionId>/` as a worktree on
its own branch. The worktree is the agent session's working directory.

## Consequences

Good:

- Concurrent missions on one repository cannot interfere. With a shared checkout, one agent's `git checkout`
  silently changes the files under another mid-edit — a corruption that would be very hard to diagnose from
  a transcript.
- Worktrees share the object store, so the second worktree of a large repository costs a checkout, not
  another full clone.
- Matches how the work would be done by hand: branch per task, isolated tree.
- Cleanup is `git worktree remove`.

Bad:

- Disk grows with concurrent missions, not with repositories. A concurrency cap bounds it.
- Abandoned worktrees leak if a mission dies badly, so `git worktree prune` runs on startup.
- Worktrees complicate anything assuming one checkout per repo — notably some hook and submodule setups.

Rejected: a container per mission. Real isolation, but on a 2-vCPU box the cold-start cost and the
infrastructure to maintain outweigh what it buys. Worth revisiting if untrusted repositories ever run here —
worktrees isolate missions from _each other_, not the agent from the host.
