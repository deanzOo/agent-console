import { query } from "@anthropic-ai/claude-agent-sdk";
import { getConfig } from "@/config/env";
import type { AgentDriver, AgentRun } from "./session";

// Auto-approved: reading and inspecting cannot surprise the operator, and
// stopping for permission on every `grep` would make the console unusable.
// Everything else — Bash, Write, Edit, anything networked — reaches canUseTool.
const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "NotebookRead", "TodoWrite"];

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
          allowedTools: READ_ONLY_TOOLS,
          canUseTool: options.canUseTool,
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
