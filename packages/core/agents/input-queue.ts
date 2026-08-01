/**
 * The stream of messages an agent reads from, for as long as it runs.
 *
 * Passing a plain string to the SDK is what makes a session single-shot: it
 * reads the prompt, works, and ends. An async iterable keeps the session open,
 * which is what lets the operator answer a question or change their mind while
 * the agent is still working.
 *
 * Messages pushed before the agent asks for one are held, so nothing said
 * during a busy turn is lost.
 */
export class InputQueue<T> {
  readonly #waiting: T[] = [];
  #resolve: ((value: IteratorResult<T>) => void) | undefined;
  #closed = false;

  push(message: T): void {
    if (this.#closed) return;

    const resolve = this.#resolve;
    if (resolve) {
      this.#resolve = undefined;
      resolve({ value: message, done: false });
      return;
    }
    this.#waiting.push(message);
  }

  /** Ends the stream, which is how the agent learns there is nothing more. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;

    const resolve = this.#resolve;
    if (resolve) {
      this.#resolve = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  get pending(): number {
    return this.#waiting.length;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const queued = this.#waiting.shift();
        if (queued !== undefined) {
          return Promise.resolve({ value: queued, done: false });
        }
        if (this.#closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        // Only one consumer: the SDK reads this stream, and a second reader
        // would silently take turns with the first.
        return new Promise((resolve) => {
          this.#resolve = resolve;
        });
      },
    };
  }
}
