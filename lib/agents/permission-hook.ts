import type { HookInput, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

// Auto-approved: reading and inspecting cannot surprise the operator, and
// stopping for permission on every `grep` would make the console unusable.
// Everything else — Bash, Write, Edit, anything networked — is asked about.
export const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "NotebookRead",
  "TodoWrite",
] as const;

const HOOK_EVENT = "PreToolUse";

export interface PreToolUseOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: typeof HOOK_EVENT;
    readonly permissionDecision: "allow" | "deny";
    readonly permissionDecisionReason?: string;
  };
}

export type AskOperator = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal },
) => Promise<PermissionResult>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : {};
}

function decision(
  permissionDecision: "allow" | "deny",
  reason?: string,
): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: HOOK_EVENT,
      permissionDecision,
      ...(reason === undefined ? {} : { permissionDecisionReason: reason }),
    },
  };
}

// The SDK's canUseTool callback is not consulted for every tool — the CLI
// decides on its own first, and a tool it is willing to run never reaches the
// callback at all. A PreToolUse hook is asked about every call, which is what
// an approval console has to have: with canUseTool alone the agent ran Bash
// unattended and the operator was never asked.
export function createPermissionHook(ask: AskOperator) {
  return async function preToolUse(
    input: HookInput,
    _toolUseId: unknown,
    options: { signal: AbortSignal },
  ): Promise<PreToolUseOutput> {
    // Registered only for PreToolUse, but the callback type covers every hook
    // event, so the fields are checked rather than assumed.
    if (input.hook_event_name !== HOOK_EVENT) return decision("allow");

    const toolName = input.tool_name;
    if (READ_ONLY_TOOLS.some((tool) => tool === toolName)) {
      return decision("allow");
    }

    const result = await ask(toolName, asRecord(input.tool_input), {
      signal: options.signal,
    });

    return result.behavior === "allow"
      ? decision("allow")
      : decision("deny", result.message);
  };
}
