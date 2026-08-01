// Reads the token from the environment when git asks, rather than holding it:
// a value spelled into git config is echoed back by trace output and by
// anything that dumps the agent's configuration.
const CREDENTIAL_HELPER =
  '!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f';

const GITHUB_CREDENTIAL_KEY = "credential.https://github.com.helper";

/**
 * What an agent needs to push a branch and open a pull request.
 *
 * Passed through the environment rather than written to disk, so the token
 * lives only as long as the session it was given to. `GIT_CONFIG_*` is git's
 * own way of taking configuration from the environment, which keeps the
 * credential helper out of every repository on the box.
 */
export function gitCredentialEnv(token: string | undefined): Record<string, string> {
  if (!token?.trim()) return {};

  return {
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: GITHUB_CREDENTIAL_KEY,
    GIT_CONFIG_VALUE_0: CREDENTIAL_HELPER,
  };
}
