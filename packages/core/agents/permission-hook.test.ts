import { describe, expect, it, vi } from "vitest";
import { READ_ONLY_TOOLS, createPermissionHook } from "./permission-hook";

const signal = new AbortController().signal;

// The SDK's own input shape, so the test exercises what the CLI actually sends.
function hookInput(toolName: string) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { command: "ls" },
    session_id: "s1",
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp/wt",
    permission_mode: "default",
    tool_use_id: "toolu_1",
  } as const;
}

function call(hook: ReturnType<typeof createPermissionHook>, toolName: string) {
  return hook(hookInput(toolName), undefined, { signal });
}

describe("createPermissionHook", () => {
  // This is the product: without it the agent runs Bash unattended and the
  // operator is never asked. It was exactly that, until a real mission proved
  // the SDK's own callback is not consulted for every tool.
  it("asks the operator about a tool that can change something", async () => {
    const ask = vi.fn(async () => ({ behavior: "allow" as const, updatedInput: {} }));
    const result = await call(createPermissionHook(ask), "Bash");

    expect(ask).toHaveBeenCalledWith("Bash", { command: "ls" }, { signal });
    expect(result.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("denies when the operator declines, and passes the reason back", async () => {
    const ask = vi.fn(async () => ({
      behavior: "deny" as const,
      message: "not this time",
    }));
    const result = await call(createPermissionHook(ask), "Write");

    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.hookSpecificOutput.permissionDecisionReason).toBe("not this time");
  });

  it.each(READ_ONLY_TOOLS)("allows %s without asking", async (tool) => {
    const ask = vi.fn();
    const result = await call(createPermissionHook(ask), tool);

    expect(ask).not.toHaveBeenCalled();
    expect(result.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("does not treat a tool merely prefixed with a safe name as safe", async () => {
    const ask = vi.fn(async () => ({ behavior: "allow" as const, updatedInput: {} }));
    await call(createPermissionHook(ask), "ReadAndDelete");

    expect(ask).toHaveBeenCalled();
  });
});
