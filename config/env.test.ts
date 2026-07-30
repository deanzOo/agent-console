import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const HOME = "/home/example";

function parse(overrides: Record<string, string | undefined> = {}) {
  return parseEnv({ AUTH_MODE: "trusted-network", ...overrides }, { homedir: HOME });
}

describe("parseEnv", () => {
  describe("defaults", () => {
    it("defaults AUTH_MODE to cloudflare-access", () => {
      const config = parseEnv(
        { CF_ACCESS_TEAM_DOMAIN: "acme.cloudflareaccess.com", CF_ACCESS_AUD: "aud1" },
        { homedir: HOME },
      );
      expect(config.authMode).toBe("cloudflare-access");
    });

    it("roots DATA_DIR under the home directory", () => {
      expect(parse().dataDir).toBe(`${HOME}/.claudevps`);
    });

    it("nests WORKSPACE_ROOT inside DATA_DIR", () => {
      expect(parse().workspaceRoot).toBe(`${HOME}/.claudevps/work`);
    });

    it("keeps WORKSPACE_ROOT under an overridden DATA_DIR", () => {
      expect(parse({ DATA_DIR: "/srv/agents" }).workspaceRoot).toBe("/srv/agents/work");
    });

    it("lets WORKSPACE_ROOT be set independently of DATA_DIR", () => {
      const config = parse({
        DATA_DIR: "/srv/agents",
        WORKSPACE_ROOT: "/mnt/big/work",
      });
      expect(config.workspaceRoot).toBe("/mnt/big/work");
    });

    it("defaults PORT to 3000 and HOST to loopback", () => {
      expect(parse().port).toBe(3000);
      expect(parse().host).toBe("127.0.0.1");
    });
  });

  describe("validation", () => {
    it("rejects an unknown AUTH_MODE and names the key", () => {
      expect(() => parse({ AUTH_MODE: "oauth" })).toThrowError(/AUTH_MODE/);
    });

    it("rejects a non-numeric PORT", () => {
      expect(() => parse({ PORT: "http" })).toThrowError(/PORT/);
    });

    it("rejects a PORT outside the valid range", () => {
      expect(() => parse({ PORT: "70000" })).toThrowError(/PORT/);
    });

    it("names every missing key at once rather than failing one at a time", () => {
      let message = "";
      try {
        parseEnv({ AUTH_MODE: "cloudflare-access" }, { homedir: HOME });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("CF_ACCESS_TEAM_DOMAIN");
      expect(message).toContain("CF_ACCESS_AUD");
    });
  });

  describe("cloudflare-access mode", () => {
    it("requires the team domain and audience", () => {
      expect(() => parse({ AUTH_MODE: "cloudflare-access" })).toThrowError(
        /CF_ACCESS_TEAM_DOMAIN/,
      );
    });

    it("accepts a fully configured Access deployment", () => {
      const config = parse({
        AUTH_MODE: "cloudflare-access",
        CF_ACCESS_TEAM_DOMAIN: "acme.cloudflareaccess.com",
        CF_ACCESS_AUD: "aud1",
      });
      expect(config).toMatchObject({
        authMode: "cloudflare-access",
        cfAccessTeamDomain: "acme.cloudflareaccess.com",
        cfAccessAud: "aud1",
      });
    });
  });

  describe("password mode", () => {
    it("requires a session secret, since middleware cannot reach the database", () => {
      expect(() => parse({ AUTH_MODE: "password" })).toThrowError(/SESSION_SECRET/);
    });

    it("rejects a session secret too short to be worth signing with", () => {
      expect(() =>
        parse({ AUTH_MODE: "password", SESSION_SECRET: "short" }),
      ).toThrowError(/SESSION_SECRET/);
    });

    it("accepts a sufficiently long secret", () => {
      const secret = "a".repeat(32);
      expect(
        parse({ AUTH_MODE: "password", SESSION_SECRET: secret }).sessionSecret,
      ).toBe(secret);
    });

    it("does not require a session secret in other modes", () => {
      expect(parse().sessionSecret).toBeUndefined();
    });
  });

  describe("trusted-network mode", () => {
    it("allows binding to loopback", () => {
      expect(parse({ HOST: "127.0.0.1" }).host).toBe("127.0.0.1");
    });

    it("allows binding to IPv6 loopback", () => {
      expect(parse({ HOST: "::1" }).host).toBe("::1");
    });

    it("refuses a public bind without an explicit override", () => {
      expect(() => parse({ HOST: "0.0.0.0" })).toThrowError(/ALLOW_INSECURE/);
    });

    it("allows a public bind when the override is set", () => {
      expect(parse({ HOST: "0.0.0.0", ALLOW_INSECURE: "1" }).host).toBe("0.0.0.0");
    });

    it("only accepts the literal override value", () => {
      expect(() => parse({ HOST: "0.0.0.0", ALLOW_INSECURE: "yes" })).toThrowError(
        /ALLOW_INSECURE/,
      );
    });

    it("does not restrict the bind address in other auth modes", () => {
      const config = parse({
        AUTH_MODE: "cloudflare-access",
        CF_ACCESS_TEAM_DOMAIN: "acme.cloudflareaccess.com",
        CF_ACCESS_AUD: "aud1",
        HOST: "0.0.0.0",
      });
      expect(config.host).toBe("0.0.0.0");
    });
  });

  describe("anthropic credential", () => {
    it("reads a subscription oauth token", () => {
      expect(parse({ CLAUDE_CODE_OAUTH_TOKEN: "oat-token" }).claudeCodeOauthToken).toBe(
        "oat-token",
      );
    });

    it("reports a credential as present when the oauth token is set", () => {
      expect(parse({ CLAUDE_CODE_OAUTH_TOKEN: "t" }).hasAnthropicCredential).toBe(true);
    });

    it("reports a credential as present when an api key is set", () => {
      expect(parse({ ANTHROPIC_API_KEY: "k" }).hasAnthropicCredential).toBe(true);
    });

    it("reports none when neither is set", () => {
      expect(parse().hasAnthropicCredential).toBe(false);
    });

    it("does not fail boot without one, since the CLI's own login may cover it", () => {
      expect(() => parse()).not.toThrow();
    });
  });

  describe("optional credentials", () => {
    it("leaves optional integrations unset when absent", () => {
      const config = parse();
      expect(config.anthropicApiKey).toBeUndefined();
      expect(config.githubToken).toBeUndefined();
      expect(config.asanaToken).toBeUndefined();
    });

    it("treats an empty string as unset", () => {
      expect(parse({ GITHUB_TOKEN: "" }).githubToken).toBeUndefined();
    });

    it("reads optional credentials when present", () => {
      expect(parse({ GITHUB_TOKEN: "token" }).githubToken).toBe("token");
    });
  });
});
