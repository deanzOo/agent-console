/**
 * What may run without asking.
 *
 * The hook is asked about every tool call, which is what makes the console an
 * approval console. That also means the hook — not the CLI — decides what the
 * permission mode means: setting a mode the hook ignores changes nothing, which
 * is exactly how "auto edits" came to ask about everything anyway.
 */
// bypassPermissions is deliberately absent: it would make an approval console
// pointless, and the agent has a shell in a container holding a git token.
export const APPROVAL_MODES = ["default", "acceptEdits", "plan"] as const;

export type ApprovalMode = (typeof APPROVAL_MODES)[number];

// Reading and inspecting cannot surprise the operator, and stopping for
// permission on every grep would make the console unusable.
export const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "NotebookRead",
  "TodoWrite",
] as const;

// Editing files is the work. It is undoable, confined to the mission's own
// worktree, and asking about every hunk is what made the console unusable.
export const EDIT_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"] as const;

export interface Policy {
  readonly mode: ApprovalMode;
  /** Tools the operator has already said yes to for this mission. */
  readonly allowed: ReadonlySet<string>;
}

export function autoApproves(policy: Policy, toolName: string): boolean {
  if (READ_ONLY_TOOLS.some((tool) => tool === toolName)) return true;
  if (policy.allowed.has(toolName)) return true;

  // Bash and anything networked still ask, in every mode. A shell in a
  // container holding a git token is the thing the operator is here to watch.
  return policy.mode === "acceptEdits" && EDIT_TOOLS.some((tool) => tool === toolName);
}
