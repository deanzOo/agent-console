import { describe, expect, it, vi } from "vitest";
import { PendingPrompts } from "./pending";

describe("PendingPrompts", () => {
  it("parks a prompt without settling it", async () => {
    const pending = new PendingPrompts();
    const settled = vi.fn();
    void pending.park("p1").then(settled, settled);

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(pending.has("p1")).toBe(true);
  });

  it("resolves a parked prompt with the decision", async () => {
    const pending = new PendingPrompts();
    const promise = pending.park("p1");

    expect(pending.resolve("p1", { behavior: "allow" })).toBe(true);
    await expect(promise).resolves.toEqual({ behavior: "allow" });
  });

  it("resolves with a denial and its message", async () => {
    const pending = new PendingPrompts();
    const promise = pending.park("p1");

    pending.resolve("p1", { behavior: "deny", message: "not this time" });
    await expect(promise).resolves.toEqual({
      behavior: "deny",
      message: "not this time",
    });
  });

  it("forgets a prompt once answered", async () => {
    const pending = new PendingPrompts();
    const promise = pending.park("p1");
    pending.resolve("p1", { behavior: "allow" });
    await promise;

    expect(pending.has("p1")).toBe(false);
  });

  it("ignores a second answer instead of throwing", async () => {
    const pending = new PendingPrompts();
    const promise = pending.park("p1");

    expect(pending.resolve("p1", { behavior: "allow" })).toBe(true);
    expect(pending.resolve("p1", { behavior: "deny", message: "late" })).toBe(false);
    await expect(promise).resolves.toEqual({ behavior: "allow" });
  });

  it("reports an answer to an unknown prompt as unhandled", () => {
    expect(new PendingPrompts().resolve("nope", { behavior: "allow" })).toBe(false);
  });

  it("keeps prompts independent", async () => {
    const pending = new PendingPrompts();
    const first = pending.park("p1");
    const second = pending.park("p2");

    pending.resolve("p2", { behavior: "deny", message: "no" });
    await expect(second).resolves.toMatchObject({ behavior: "deny" });
    expect(pending.has("p1")).toBe(true);
    void first;
  });

  it("denies everything outstanding when the session ends", async () => {
    const pending = new PendingPrompts();
    const first = pending.park("p1");
    const second = pending.park("p2");

    pending.cancelAll("session stopped");

    await expect(first).resolves.toEqual({
      behavior: "deny",
      message: "session stopped",
      interrupt: true,
    });
    await expect(second).resolves.toMatchObject({ behavior: "deny" });
    expect(pending.size).toBe(0);
  });

  it("denies a prompt when its abort signal fires", async () => {
    const pending = new PendingPrompts();
    const controller = new AbortController();
    const promise = pending.park("p1", controller.signal);

    controller.abort();

    await expect(promise).resolves.toMatchObject({ behavior: "deny" });
    expect(pending.has("p1")).toBe(false);
  });

  it("denies immediately when handed an already-aborted signal", async () => {
    const pending = new PendingPrompts();
    const promise = pending.park("p1", AbortSignal.abort());

    await expect(promise).resolves.toMatchObject({ behavior: "deny" });
    expect(pending.has("p1")).toBe(false);
  });

  it("stops the abort from settling a prompt that was already answered", async () => {
    const pending = new PendingPrompts();
    const controller = new AbortController();
    const promise = pending.park("p1", controller.signal);

    pending.resolve("p1", { behavior: "allow" });
    controller.abort();

    await expect(promise).resolves.toEqual({ behavior: "allow" });
  });

  it("counts what is outstanding", () => {
    const pending = new PendingPrompts();
    expect(pending.size).toBe(0);
    void pending.park("p1");
    void pending.park("p2");
    expect(pending.size).toBe(2);
  });
});
