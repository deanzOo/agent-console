import { getConfig } from "@agent-console/core/env";
import { createAuthAdapter } from "@agent-console/core/auth";
import { getDatabase } from "@agent-console/core/db";
import { getSetting } from "@agent-console/core/settings";
import { canAccessSetup } from "@agent-console/core/setup";

// The setup routes are public in the middleware, because a fresh install has no
// way to authenticate yet. They answer the rest of the question here, where the
// database says whether anything has been configured.
export async function setupAccessAllowed(request: Request): Promise<boolean> {
  const config = getConfig();
  const user = await createAuthAdapter(config).getUser(request);
  return canAccessSetup({
    authenticated: user !== null,
    authMode: config.authMode,
    passwordSet: getSetting(getDatabase(), "password_hash") !== undefined,
  });
}
