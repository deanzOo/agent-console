import type { AuthMode } from "@/config/env";
import { createCloudflareAccessAdapter } from "./cloudflare";
import { createPasswordAdapter } from "./password";
import { createTrustedNetworkAdapter } from "./trusted";
import type { AuthAdapter } from "./types";

export type { AuthAdapter, User } from "./types";
export { ACCESS_JWT_HEADER } from "./cloudflare";
export { SESSION_COOKIE, hashPassword, issueSession, verifyPassword } from "./password";

export interface AuthAdapterOptions {
  readonly authMode: AuthMode;
  readonly cfAccessTeamDomain?: string | undefined;
  readonly cfAccessAud?: string | undefined;
  readonly sessionSecret?: string | undefined;
}

// Misconfiguration throws at construction rather than degrading to "nobody is
// authenticated" or "everybody is" at request time.
export function createAuthAdapter(options: AuthAdapterOptions): AuthAdapter {
  switch (options.authMode) {
    case "cloudflare-access": {
      if (!options.cfAccessTeamDomain) {
        throw new Error("AUTH_MODE=cloudflare-access requires CF_ACCESS_TEAM_DOMAIN");
      }
      if (!options.cfAccessAud) {
        throw new Error("AUTH_MODE=cloudflare-access requires CF_ACCESS_AUD");
      }
      return createCloudflareAccessAdapter({
        teamDomain: options.cfAccessTeamDomain,
        aud: options.cfAccessAud,
      });
    }
    case "password": {
      if (!options.sessionSecret) {
        throw new Error(
          "AUTH_MODE=password requires a session secret (SESSION_SECRET)",
        );
      }
      return createPasswordAdapter({ sessionSecret: options.sessionSecret });
    }
    case "trusted-network":
      return createTrustedNetworkAdapter();
  }
}
