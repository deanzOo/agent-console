import {
  query,
  type PermissionMode,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { gitCredentialEnv } from "./agent-env";
import { InputQueue } from "./input-queue";
import { getConfig } from "../env";
import { createPermissionHook } from "./permission-hook";
import type { AgentDriver, AgentRun } from "./session";

function userMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: "",
  };
}

// process.env types every value as optional; the SDK takes a plain string map.
function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

export function createSdkDriver(githubToken?: string | undefined): AgentDriver {
  // The SDK prefers the prebuilt binary it ships, which is linked against a
  // libc that need not match the host — in the container it exists and refuses
  // to launch, failing the mission the moment it starts. Naming the CLI the
  // image actually installed is the difference between running and not.
  const { claudeCliPath } = getConfig();

  return {
    start(options): AgentRun {
      // A string prompt makes the session single-shot; an async iterable keeps
      // it open, which is what lets the operator speak to a working agent.
      const input = new InputQueue<SDKUserMessage>();
      input.push(userMessage(options.prompt));

      const run = query({
        prompt: input,
        options: {
          cwd: options.cwd,
          permissionMode: "default",
          // Without a credential the agent does the work, commits, and stops
          // at the push with nothing it can do about it.
          env: { ...inheritedEnv(), ...gitCredentialEnv(githubToken) },
          // Not canUseTool and not allowedTools: the CLI decides for itself
          // before either is consulted, so a tool it is willing to run never
          // reaches them. The hook is asked about every call.
          hooks: {
            PreToolUse: [
              { hooks: [createPermissionHook(options.canUseTool, options.policy)] },
            ],
          },
          ...(claudeCliPath === undefined
            ? {}
            : { pathToClaudeCodeExecutable: claudeCliPath }),
          ...(options.resume === undefined ? {} : { resume: options.resume }),
        },
      });

      return {
        messages: run,
        say: (text: string) => input.push(userMessage(text)),
        setMode: async (mode: PermissionMode) => {
          await run.setPermissionMode(mode);
        },
        interrupt: async () => {
          await run.interrupt();
        },
        close: () => {
          input.close();
          run.close();
        },
      };
    },
  };
}
