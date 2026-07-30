import type { PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "../db";
import {
  appendEvent,
  recordPrompt,
  setSessionId,
  setStatus,
  type StoredEvent,
} from "../missions";
import { PendingPrompts } from "./pending";

export type EventListener = (event: StoredEvent) => void;

export interface StartOptions {
  readonly missionId: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly resume?: string | undefined;
}

// Injected so the loop can be driven by a fake in tests; the real one wraps the
// Agent SDK's query().
export interface AgentDriver {
  start(options: {
    prompt: string;
    cwd: string;
    resume?: string | undefined;
    canUseTool: (
      toolName: string,
      input: Record<string, unknown>,
      options: { signal: AbortSignal },
    ) => Promise<PermissionResult>;
  }): AgentRun;
}

export interface AgentRun {
  readonly messages: AsyncIterable<SDKMessage>;
  interrupt(): Promise<void>;
  close(): void;
}

export class MissionSession {
  readonly #db: Db;
  readonly #missionId: string;
  readonly #pending = new PendingPrompts();
  readonly #listeners = new Set<EventListener>();
  #run: AgentRun | undefined;
  #finished: Promise<void> | undefined;

  constructor(db: Db, missionId: string) {
    this.#db = db;
    this.#missionId = missionId;
  }

  subscribe(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(driver: AgentDriver, options: StartOptions): void {
    if (this.#run) throw new Error("Session already started");

    this.#run = driver.start({
      prompt: options.prompt,
      cwd: options.cwd,
      resume: options.resume,
      canUseTool: (toolName, input, { signal }) =>
        this.#requestPermission(toolName, input, signal),
    });

    setStatus(this.#db, this.#missionId, "running");
    this.#record("mission.status", { status: "running" });
    this.#finished = this.#consume(this.#run);
  }

  answer(promptId: string, result: PermissionResult): boolean {
    const handled = this.#pending.resolve(promptId, result);
    if (handled) {
      setStatus(this.#db, this.#missionId, "running");
      this.#record("mission.status", { status: "running" });
    }
    return handled;
  }

  async interrupt(): Promise<void> {
    this.#pending.cancelAll("Interrupted by the operator.");
    await this.#run?.interrupt();
  }

  async stop(): Promise<void> {
    this.#pending.cancelAll("Session stopped.");
    this.#run?.close();
    await this.#finished;
  }

  async #requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    const prompt = recordPrompt(this.#db, {
      missionId: this.#missionId,
      kind: "tool_approval",
      toolName,
      input,
    });

    setStatus(this.#db, this.#missionId, "awaiting_input");
    this.#record("mission.prompt", { promptId: prompt.id, toolName, input });

    return this.#pending.park(prompt.id, signal);
  }

  async #consume(run: AgentRun): Promise<void> {
    try {
      for await (const message of run.messages) {
        this.#captureSessionId(message);
        this.#record(`agent.${message.type}`, message);
      }
      setStatus(this.#db, this.#missionId, "done");
      this.#record("mission.status", { status: "done" });
    } catch (error) {
      setStatus(this.#db, this.#missionId, "failed");
      this.#record("mission.status", {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#pending.cancelAll("Session ended.");
    }
  }

  #captureSessionId(message: SDKMessage): void {
    if ("session_id" in message && typeof message.session_id === "string") {
      setSessionId(this.#db, this.#missionId, message.session_id);
    }
  }

  #record(type: string, payload: unknown): void {
    const event = appendEvent(this.#db, this.#missionId, type, payload);
    for (const listener of this.#listeners) listener(event);
  }
}
