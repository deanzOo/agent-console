import { describe, expect, it } from "vitest";
import { createAuthAdapter } from "./index";

const CF = {
  authMode: "cloudflare-access",
  cfAccessTeamDomain: "team.example.invalid",
  cfAccessAud: "aud",
} as const;

function request() {
  return new Request("https://console.example.invalid/");
}

describe("createAuthAdapter", () => {
  it("builds a cloudflare-access adapter that rejects an unauthenticated request", async () => {
    const adapter = createAuthAdapter(CF);
    expect(await adapter.getUser(request())).toBeNull();
  });

  it("builds a password adapter that rejects a request with no session", async () => {
    const adapter = createAuthAdapter({
      authMode: "password",
      sessionSecret: "secret",
    });
    expect(await adapter.getUser(request())).toBeNull();
  });

  it("builds a trusted-network adapter that authenticates", async () => {
    const adapter = createAuthAdapter({ authMode: "trusted-network" });
    expect(await adapter.getUser(request())).not.toBeNull();
  });

  it("refuses cloudflare-access without a team domain", () => {
    expect(() =>
      createAuthAdapter({ authMode: "cloudflare-access", cfAccessAud: "aud" }),
    ).toThrowError(/CF_ACCESS_TEAM_DOMAIN/);
  });

  it("refuses cloudflare-access without an audience", () => {
    expect(() =>
      createAuthAdapter({
        authMode: "cloudflare-access",
        cfAccessTeamDomain: "team.example.invalid",
      }),
    ).toThrowError(/CF_ACCESS_AUD/);
  });

  it("refuses password mode with no session secret, rather than signing with a blank key", () => {
    expect(() => createAuthAdapter({ authMode: "password" })).toThrowError(
      /session secret/i,
    );
  });
});
