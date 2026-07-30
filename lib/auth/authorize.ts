import type { AuthMode } from "@/config/env";

export type AccessDecision =
  | { readonly type: "allow" }
  | { readonly type: "unauthorized-json" }
  | { readonly type: "unauthorized-text" }
  | { readonly type: "redirect-to-login"; readonly next: string };

export interface AccessRequest {
  readonly pathname: string;
  readonly authenticated: boolean;
  readonly authMode: AuthMode;
}

// /api/login is the gate itself, and /setup is the only way a first password
// gets set — locking either behind a session deadlocks a fresh install. The
// setup routes re-check authorization against the database, which is where
// "has this been configured yet" can actually be answered.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/setup",
  "/api/setup",
  "/manifest.webmanifest",
  "/sw.js",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/icons/");
}

export function decideAccess(request: AccessRequest): AccessDecision {
  if (request.authenticated || isPublic(request.pathname)) {
    return { type: "allow" };
  }

  if (request.pathname.startsWith("/api/")) {
    return { type: "unauthorized-json" };
  }

  if (request.authMode === "password") {
    return { type: "redirect-to-login", next: request.pathname };
  }

  // Under Cloudflare Access, reaching here means the edge was bypassed — there
  // is no in-app login to send the caller to.
  return { type: "unauthorized-text" };
}
