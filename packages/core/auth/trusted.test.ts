import { describe, expect, it } from "vitest";
import { createTrustedNetworkAdapter } from "./trusted";

describe("trusted-network adapter", () => {
  it("authenticates every request, because the network is the boundary", async () => {
    const user = await createTrustedNetworkAdapter().getUser(
      new Request("https://console.example.invalid/"),
    );
    expect(user).toEqual({ id: "trusted-network", email: undefined });
  });

  it("does not depend on any header the caller controls", async () => {
    const adapter = createTrustedNetworkAdapter();
    const withHeaders = await adapter.getUser(
      new Request("https://console.example.invalid/", {
        headers: { "x-forwarded-user": "someone-else" },
      }),
    );
    expect(withHeaders?.id).toBe("trusted-network");
  });
});
