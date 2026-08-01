import { beforeEach, describe, expect, it, vi } from "vitest";

const getSetting = vi.fn();
const run = vi.fn();
const onConflictDoNothing = vi.fn(() => ({ run }));
const values = vi.fn(() => ({ onConflictDoNothing }));
const insert = vi.fn(() => ({ values }));

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({ insert }) }));
vi.mock("@agent-console/core/schema", () => ({ pushSubscriptions: {} }));
vi.mock("@agent-console/core/settings", () => ({ getSetting }));

const { GET, POST } = await import("./route");

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/abc",
  keys: { p256dh: "key", auth: "auth" },
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSetting.mockReturnValue("a-public-key");
});

describe("GET /api/push", () => {
  it("hands over the key a browser needs to subscribe", async () => {
    await expect(GET().json()).resolves.toEqual({ publicKey: "a-public-key" });
  });

  // An unconfigured integration is a supported state, so the route is absent
  // rather than broken.
  it("is absent when push is not configured", () => {
    getSetting.mockReturnValue(undefined);

    expect(GET().status).toBe(404);
  });
});

describe("POST /api/push", () => {
  it("stores the subscription", async () => {
    expect((await post(SUBSCRIPTION)).status).toBe(201);
    expect(values).toHaveBeenCalledWith({
      endpoint: SUBSCRIPTION.endpoint,
      keysJson: JSON.stringify(SUBSCRIPTION.keys),
    });
  });

  // The same phone re-subscribing is ordinary, not a conflict to report.
  it("ignores one it already has", async () => {
    await post(SUBSCRIPTION);

    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("refuses a subscription without its keys", async () => {
    expect((await post({ endpoint: SUBSCRIPTION.endpoint })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses to store anything when push is not configured", async () => {
    getSetting.mockReturnValue(undefined);

    expect((await post(SUBSCRIPTION)).status).toBe(404);
    expect(insert).not.toHaveBeenCalled();
  });
});
