import { describe, expect, it } from "vitest";
import { gitCredentialEnv } from "./agent-env";

const TOKEN = "ghp_example_token_value";

describe("gitCredentialEnv", () => {
  it("gives the agent nothing when no token is configured", () => {
    expect(gitCredentialEnv(undefined)).toEqual({});
  });

  it("treats a blank token as none", () => {
    expect(gitCredentialEnv("   ")).toEqual({});
  });

  it("authenticates gh", () => {
    expect(gitCredentialEnv(TOKEN).GH_TOKEN).toBe(TOKEN);
  });

  it("authenticates git over https", () => {
    const env = gitCredentialEnv(TOKEN);

    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("credential.https://github.com.helper");
    expect(env.GIT_CONFIG_VALUE_0).toContain("username=x-access-token");
  });

  // The helper reads the token from the environment at the moment git asks for
  // it. Spelling it into the config value would put the token in a string git
  // echoes back when tracing, and in anything that dumps the agent's config.
  it("keeps the token out of the git config value", () => {
    expect(gitCredentialEnv(TOKEN).GIT_CONFIG_VALUE_0).not.toContain(TOKEN);
  });
});
