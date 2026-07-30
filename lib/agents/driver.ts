import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentDriver, AgentRun } from "./session";

// Auto-approved: reading and inspecting cannot surprise the operator, and
// stopping for permission on every `grep` would make the console unusable.
// Everything else — Bash, Write, Edit, anything networked — reaches canUseTool.
const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "NotebookRead", "TodoWrite"];

export function createSdkDriver(): AgentDriver {
  return {
    start(options): AgentRun {
      const run = query({
        prompt: options.prompt,
        options: {
          cwd: options.cwd,
          permissionMode: "default",
          allowedTools: READ_ONLY_TOOLS,
          canUseTool: options.canUseTool,
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
