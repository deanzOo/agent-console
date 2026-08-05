import type { PermissionResult, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "../db";
import {
  appendEvent,
  getMission,
  recordPrompt,
  setSessionId,
  setStatus,
  type MissionStatus,
  type StoredEvent,
} from "../missions";
import {
  buildNotification,
  deliver,
  isNotifiable,
  type NotificationKind,
} from "../notify";
import { configuredChannels } from "../notify-channels";
import { MISSION_STATUS, PROMPT_KIND } from "../schema";
import { PendingPrompts } from "./pending";
import type { ApprovalMode, Policy } from "./policy";

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
    /** Read per tool call: the operator changes this while the agent works. */
    policy: () => Policy;
  }): AgentRun;
}

export interface AgentRun {
  readonly messages: AsyncIterable<SDKMessage>;
  /** Sends the operator's words to a session that is already running. */
  say(text: string): void;
  setMode(mode: ApprovalMode): Promise<void>;
  interrupt(): Promise<void>;
  close(): void;
}

export class MissionSession {
  readonly #db: Db;
  readonly #missionId: string;
  readonly #pending = new PendingPrompts();
  readonly #listeners = new Set<EventListener>();
  #run: AgentRun | undefined;
  #mode: ApprovalMode = "default";
  // Per mission, and only in memory: a standing "yes" to a shell should not
  // outlive the session the operator granted it in.
  readonly #allowed = new Set<string>();
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
      policy: () => ({ mode: this.#mode, allowed: this.#allowed }),
    });

    setStatus(this.#db, this.#missionId, MISSION_STATUS.RUNNING);
    this.#record("mission.status", { status: MISSION_STATUS.RUNNING });
    this.#finished = this.#consume(this.#run);
  }

  answer(promptId: string, result: PermissionResult): boolean {
    const handled = this.#pending.resolve(promptId, result);
    if (handled) this.#settle(MISSION_STATUS.RUNNING);
    return handled;
  }

  async interrupt(): Promise<void> {
    this.#pending.cancelAll("Interrupted by the operator.");
    await this.#run?.interrupt();
  }

  /**
   * Settles when the session itself ends, which is not when the mission says
   * done.
   *
   * Streaming input keeps a session open after the agent finishes a turn, so
   * `done` describes the conversation while the process is still there holding
   * memory. Anything counting what the box is running has to wait for this.
   */
  async whenFinished(): Promise<void> {
    await this.#finished;
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
    // A finished mission is still live and still takes a reply, which puts it
    // back to work.
    this.#settle(MISSION_STATUS.RUNNING);
    this.#run.say(text);
    return true;
  }

  /** Stops asking about this tool for the rest of the mission. */
  alwaysAllow(toolName: string): void {
    this.#allowed.add(toolName);
    this.#record("mission.allowed", { toolName });
  }

  async setMode(mode: ApprovalMode): Promise<boolean> {
    if (!this.#run) return false;
    this.#mode = mode;
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
        // Streaming input holds the stream open for a reply, so the agent
        // finishing a turn is the only signal that it stopped working.
        if (message.type === "result") this.#settle(MISSION_STATUS.DONE);
      }
      this.#settle(MISSION_STATUS.DONE);
    } catch (error) {
      this.#settle(
        MISSION_STATUS.FAILED,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.#pending.cancelAll("Session ended.");
    }
  }

  /** Records a status the mission has reached, once. */
  #settle(status: MissionStatus, error?: string): void {
    if (getMission(this.#db, this.#missionId)?.status === status) return;

    setStatus(this.#db, this.#missionId, status);
    this.#record("mission.status", error ? { status, error } : { status });
    if (isNotifiable(status)) this.#notify(status);
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
