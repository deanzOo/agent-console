# 9. Approvals go through a PreToolUse hook, not canUseTool

- Status: accepted
- Date: 2026-08-01

## Context and problem statement

The console exists to put a human in front of an agent's tool calls. The original design used the Agent SDK's
`canUseTool` callback, which reads as the obvious place for that decision.

In use it was not. The operator reported approving "every other message", and that switching to auto mode
"keeps asking permissions nonstop, and seems to get nowhere" — two complaints that sound contradictory until
you find the cause.

**`canUseTool` is not consulted for every tool call.** The CLI decides first, and any tool it is willing to run
on its own never reaches the callback. So some calls were gated and others were not, with no pattern the
operator could see. Setting `permissionMode` did not help either: the mode changes what the CLI decides, not
what the console was asked about, so "auto edits" changed nothing the operator could feel.

## Considered options

1. **Keep `canUseTool` and widen `allowedTools`.** Whatever the CLI runs unasked stays unasked.
2. **A `PreToolUse` hook.** Asked about every call, before the CLI's own decision.

## Decision

Option 2. Every tool call passes the hook, and the hook — not the CLI — decides what a permission mode means
here.

That decision lives in `packages/core/agents/policy.ts`, on its own and testable without an agent:

- reading and inspecting never ask, because stopping for permission on every grep makes the console unusable;
- editing files asks unless the mission is in `acceptEdits`, since edits are undoable and confined to the
  mission's own worktree;
- **Bash asks in every mode**, because a shell in a container holding a git token is the thing the operator is
  there to watch.

`bypassPermissions` is deliberately not an accepted mode: an approval console that can be told to stop
approving is pointless. The three allowed modes are defined once in `policy.ts` and exported through
`protocol.ts` as the schema both the console and the session host parse with.

## Consequences

Approvals became predictable, which is what made "always allow this tool for this mission" worth having — a
standing yes is only safe when the set of things being asked about is complete.

The standing yes is per mission and in memory only. A permission granted for one mission does not outlive the
session it was granted in.

Anyone reading the SDK's documentation will expect `canUseTool` to be the gate. It is not, and a `canUseTool`
that looks correct will silently gate a subset. That is the trap this decision exists to record.
