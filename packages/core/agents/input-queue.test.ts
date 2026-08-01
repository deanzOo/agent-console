import { describe, expect, it } from "vitest";
import { InputQueue } from "./input-queue";

async function take<T>(queue: InputQueue<T>, count: number): Promise<T[]> {
  const seen: T[] = [];
  for await (const item of queue) {
    seen.push(item);
    if (seen.length === count) break;
  }
  return seen;
}

describe("InputQueue", () => {
  it("delivers what was pushed before anyone was reading", async () => {
    const queue = new InputQueue<string>();
    queue.push("one");
    queue.push("two");

    expect(await take(queue, 2)).toEqual(["one", "two"]);
  });

  // The agent reads faster than the operator types, so the common case is a
  // reader already waiting when a message finally arrives.
  it("wakes a reader that was already waiting", async () => {
    const queue = new InputQueue<string>();
    const reading = take(queue, 1);

    queue.push("late");

    expect(await reading).toEqual(["late"]);
  });

  it("ends the stream when closed", async () => {
    const queue = new InputQueue<string>();
    queue.push("only");
    queue.close();

    const seen: string[] = [];
    for await (const item of queue) seen.push(item);

    expect(seen).toEqual(["only"]);
  });

  it("releases a waiting reader when closed", async () => {
    const queue = new InputQueue<string>();
    const seen: string[] = [];
    const reading = (async () => {
      for await (const item of queue) seen.push(item);
    })();

    queue.close();
    await reading;

    expect(seen).toEqual([]);
  });

  // A message accepted after close would be dropped silently later, which reads
  // to the operator as the agent ignoring them.
  it("refuses messages after close rather than swallowing them", () => {
    const queue = new InputQueue<string>();
    queue.close();
    queue.push("too late");

    expect(queue.pending).toBe(0);
  });

  it("keeps order across a mix of buffered and awaited messages", async () => {
    const queue = new InputQueue<number>();
    queue.push(1);
    const reading = take(queue, 3);
    queue.push(2);
    queue.push(3);

    expect(await reading).toEqual([1, 2, 3]);
  });
});
