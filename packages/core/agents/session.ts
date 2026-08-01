import type {
  PermissionMode,
  PermissionResult,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "../db";
import {
  appendEvent,
  getMission,
  recordPrompt,
  setSessionId,
  setStatus,
  type StoredEvent,
} from "../missions";
import { buildNotification, deliver, type NotificationKind } from "../notify";
import { configuredChannels } from "../notify-channels";
import { MISSION_STATUS, PROMPT_KIND } from "../schema";
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
  /** Sends the operator's words to a session that is already running. */
  say(text: string): void;
  setMode(mode: PermissionMode): Promise<void>;
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

    setStatus(this.#db, this.#missionId, MISSION_STATUS.RUNNING);
    this.#record("mission.status", { status: MISSION_STATUS.RUNNING });
    this.#finished = this.#consume(this.#run);
  }

  answer(promptId: string, result: PermissionResult): boolean {
    const handled = this.#pending.resolve(promptId, result);
    if (handled) {
      setStatus(this.#db, this.#missionId, MISSION_STATUS.RUNNING);
      this.#record("mission.status", { status: MISSION_STATUS.RUNNING });
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

  /** The operator speaking mid-mission, recorded before it is delivered. */
  say(text: string): boolean {
    if (!this.#run) return false;
    this.#record("mission.said", { text });
    this.#run.say(text);
    return true;
  }

  async setMode(mode: PermissionMode): Promise<boolean> {
    if (!this.#run) return false;
    await this.#run.setMode(mode);
    // Recorded, because a transcript where approvals simply stop appearing is
    // worse than one that says the posture changed and to what.
    this.#record("mission.mode", { mode });
    return true;
  }

  async #requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    const prompt = recordPrompt(this.#db, {
      missionId: this.#missionId,
      kind: PROMPT_KIND.TOOL_APPROVAL,
      toolName,
      input,
    });

    setStatus(this.#db, this.#missionId, MISSION_STATUS.AWAITING_INPUT);
    this.#record("mission.prompt", { promptId: prompt.id, toolName, input });
    this.#notify(MISSION_STATUS.AWAITING_INPUT, toolName);

    return this.#pending.park(prompt.id, signal);
  }

  async #consume(run: AgentRun): Promise<void> {
    try {
      for await (const message of run.messages) {
        this.#captureSessionId(message);
        this.#record(`agent.${message.type}`, message);
      }
      setStatus(this.#db, this.#missionId, MISSION_STATUS.DONE);
      this.#record("mission.status", { status: MISSION_STATUS.DONE });
      this.#notify(MISSION_STATUS.DONE);
    } catch (error) {
      setStatus(this.#db, this.#missionId, MISSION_STATUS.FAILED);
      this.#record("mission.status", {
        status: MISSION_STATUS.FAILED,
        error: error instanceof Error ? error.message : String(error),
      });
      this.#notify(MISSION_STATUS.FAILED);
    } finally {
      this.#pending.cancelAll("Session ended.");
    }
  }

  #captureSessionId(message: SDKMessage): void {
    if ("session_id" in message && typeof message.session_id === "string") {
      setSessionId(this.#db, this.#missionId, message.session_id);
    }
  }

  // Fire-and-forget: a failed alert must never stall the agent loop.
  #notify(kind: NotificationKind, toolName?: string): void {
    const mission = getMission(this.#db, this.#missionId);
    if (!mission) return;

    const message = buildNotification({
      kind,
      missionId: this.#missionId,
      title: mission.title,
      toolName,
    });

    void deliver(configuredChannels(this.#db), message).catch(() => undefined);
  }

  #record(type: string, payload: unknown): void {
    const event = appendEvent(this.#db, this.#missionId, type, payload);
    for (const listener of this.#listeners) listener(event);
  }
}
