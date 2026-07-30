import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

interface Parked {
  readonly settle: (result: PermissionResult) => void;
  readonly detach: () => void;
}

// The agent is blocked on a promise nobody has resolved yet. That parked
// promise is what turns "the agent is asking something" into a UI state instead
// of a line of terminal output to pattern-match.
export class PendingPrompts {
  readonly #parked = new Map<string, Parked>();

  get size(): number {
    return this.#parked.size;
  }

  has(id: string): boolean {
    return this.#parked.has(id);
  }

  park(id: string, signal?: AbortSignal): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const onAbort = () => {
        this.#parked.delete(id);
        resolve({ behavior: "deny", message: "Aborted before it was answered." });
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      signal?.addEventListener("abort", onAbort, { once: true });

      this.#parked.set(id, {
        settle: resolve,
        detach: () => signal?.removeEventListener("abort", onAbort),
      });
    });
  }

  /** False when nothing was waiting — a double answer, or a stale prompt id. */
  resolve(id: string, result: PermissionResult): boolean {
    const parked = this.#parked.get(id);
    if (!parked) return false;

    this.#parked.delete(id);
    parked.detach();
    parked.settle(result);
    return true;
  }

  cancelAll(message: string): void {
    for (const id of [...this.#parked.keys()]) {
      this.resolve(id, { behavior: "deny", message, interrupt: true });
    }
  }
}
