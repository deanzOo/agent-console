import { createRemoteJWKSet, jwtVerify } from "jose";
import { readCookie } from "./cookies";
import type { AuthAdapter, User } from "./types";

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_COOKIE = "CF_Authorization";

type KeySource = Parameters<typeof jwtVerify>[1];

export interface CloudflareAccessOptions {
  readonly teamDomain: string;
  readonly aud: string;
  readonly keys?: KeySource;
}

function readClaim(claims: Record<string, unknown>, name: string): string | undefined {
  const value = claims[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function createCloudflareAccessAdapter(
  options: CloudflareAccessOptions,
): AuthAdapter {
  const issuer = `https://${options.teamDomain}`;
  const keys =
    options.keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return {
    async getUser(request: Request): Promise<User | null> {
      const token =
        request.headers.get(ACCESS_JWT_HEADER) ?? readCookie(request, ACCESS_COOKIE);
      if (!token) return null;

      try {
        // Checking aud matters as much as the signature: every Access app in
        // the same team is signed by the same key.
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience: options.aud,
        });

        const email = readClaim(payload, "email");
        const id = email ?? readClaim(payload, "sub");
        if (!id) return null;

        return { id, email };
      } catch {
        return null;
      }
    },
  };
}
