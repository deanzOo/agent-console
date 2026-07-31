import { query } from "@anthropic-ai/claude-agent-sdk";
import { getConfig } from "@/config/env";
import { createPermissionHook } from "./permission-hook";
import type { AgentDriver, AgentRun } from "./session";

export function createSdkDriver(): AgentDriver {
  // The SDK prefers the prebuilt binary it ships, which is linked against a
  // libc that need not match the host — in the container it exists and refuses
  // to launch, failing the mission the moment it starts. Naming the CLI the
  // image actually installed is the difference between running and not.
  const { claudeCliPath } = getConfig();

  return {
    start(options): AgentRun {
      const run = query({
        prompt: options.prompt,
        options: {
          cwd: options.cwd,
          permissionMode: "default",
          // Not canUseTool and not allowedTools: the CLI decides for itself
          // before either is consulted, so a tool it is willing to run never
          // reaches them. The hook is asked about every call.
          hooks: {
            PreToolUse: [{ hooks: [createPermissionHook(options.canUseTool)] }],
          },
          ...(claudeCliPath === undefined
            ? {}
            : { pathToClaudeCodeExecutable: claudeCliPath }),
          ...(options.resume === undefined ? {} : { resume: options.resume }),
        },
      });

      return {
        messages: run,
        interrupt: async () => {
          await run.interrupt();
        },
        close: () => run.close(),
      };
    },
  };
}
