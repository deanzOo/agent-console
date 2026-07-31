import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getConfig } from "@agent-console/core/env";
import { createAuthAdapter } from "@agent-console/core/auth";
import { decideAccess } from "@agent-console/core/auth/authorize";

// Runs before the database is reachable, so it verifies a signed token and
// nothing else. Setup state and feature gating are checked further in.
const appConfig = getConfig();
const auth = createAuthAdapter(appConfig);

export async function middleware(request: NextRequest) {
  const user = await auth.getUser(request);
  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    authenticated: user !== null,
    authMode: appConfig.authMode,
  });

  switch (decision.type) {
    case "allow":
      return NextResponse.next();
    case "unauthorized-json":
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    case "unauthorized-text":
      return new NextResponse("Unauthorized", { status: 401 });
    case "redirect-to-login": {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", decision.next);
      return NextResponse.redirect(login);
    }
  }
}

export const config = {
  // Node runtime, not edge: the config parser reads node:path and node:os, and
  // the edge runtime has no Node built-ins — every request 500s without this.
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
