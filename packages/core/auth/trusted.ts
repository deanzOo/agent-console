import type { AuthAdapter, User } from "./types";

const TRUSTED_USER: User = { id: "trusted-network", email: undefined };

// No authentication — the VPN is the boundary. config/env.ts refuses this mode
// on a non-loopback bind unless ALLOW_INSECURE is set. Ignores every request
// header on purpose: trusting one would let any client name itself.
export function createTrustedNetworkAdapter(): AuthAdapter {
  return {
    getUser(): Promise<User | null> {
      return Promise.resolve(TRUSTED_USER);
    },
  };
}
