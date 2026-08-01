import { describe, expect, it, vi } from "vitest";
import { buildNotification, deliver, isNotifiable, type Deliverer } from "./notify";
import { MISSION_STATUS } from "./schema";

describe("buildNotification", () => {
  it("leads with the fact that the agent is blocked", () => {
    const message = buildNotification({
      kind: "awaiting_input",
      missionId: "m1",
      title: "Fix the login bug",
      toolName: "Bash",
    });
    expect(message.title).toBe("Waiting on you");
    expect(message.body).toContain("Fix the login bug");
    expect(message.body).toContain("Bash");
  });

  it("still reads sensibly when no tool is named", () => {
    const message = buildNotification({
      kind: "awaiting_input",
      missionId: "m1",
      title: "Fix the login bug",
    });
    expect(message.body).toContain("Fix the login bug");
    expect(message.body).not.toContain("undefined");
  });

  it("deep-links to the mission", () => {
    expect(buildNotification({ kind: "done", missionId: "m1", title: "t" }).url).toBe(
      "/missions/m1",
    );
  });

  it("announces completion", () => {
    expect(buildNotification({ kind: "done", missionId: "m1", title: "t" }).title).toBe(
      "Mission finished",
    );
  });

  it("announces failure", () => {
    expect(
      buildNotification({ kind: "failed", missionId: "m1", title: "t" }).title,
    ).toBe("Mission failed");
  });

  it("truncates a long title so the notification stays readable", () => {
    const message = buildNotification({
      kind: "done",
      missionId: "m1",
      title: "x".repeat(300),
    });
    expect(message.body.length).toBeLessThan(160);
  });
});

describe("deliver", () => {
  const message = { title: "t", body: "b", url: "/missions/m1" };

  it("sends through every configured channel", async () => {
    const a: Deliverer = { name: "push", send: vi.fn().mockResolvedValue(undefined) };
    const b: Deliverer = {
      name: "telegram",
      send: vi.fn().mockResolvedValue(undefined),
    };

    await deliver([a, b], message);

    expect(a.send).toHaveBeenCalledWith(message);
    expect(b.send).toHaveBeenCalledWith(message);
  });

  it("does nothing when no channel is configured", async () => {
    await expect(deliver([], message)).resolves.toEqual([]);
  });

  it("keeps delivering when one channel fails", async () => {
    const failing: Deliverer = {
      name: "push",
      send: vi.fn().mockRejectedValue(new Error("gone")),
    };
    const working: Deliverer = {
      name: "telegram",
      send: vi.fn().mockResolvedValue(undefined),
    };

    const results = await deliver([failing, working], message);

    expect(working.send).toHaveBeenCalled();
    expect(results).toContainEqual({ channel: "push", ok: false, error: "gone" });
    expect(results).toContainEqual({ channel: "telegram", ok: true });
  });

  it("never rejects, because a failed alert must not stop the agent", async () => {
    const failing: Deliverer = {
      name: "push",
      send: vi.fn().mockRejectedValue(new Error("boom")),
    };
    await expect(deliver([failing], message)).resolves.toHaveLength(1);
  });
});

describe("isNotifiable", () => {
  it.each([MISSION_STATUS.AWAITING_INPUT, MISSION_STATUS.DONE, MISSION_STATUS.FAILED])(
    "wakes the operator for %s",
    (status) => {
      expect(isNotifiable(status)).toBe(true);
    },
  );

  // Nothing here is news: the operator caused it, or it is the mission simply
  // getting on with the work.
  it.each([MISSION_STATUS.STARTING, MISSION_STATUS.RUNNING, MISSION_STATUS.STOPPED])(
    "stays quiet for %s",
    (status) => {
      expect(isNotifiable(status)).toBe(false);
    },
  );
});
