import { getConfig } from "@/config/env";
import { getDatabase } from "@/lib/db";
import { setupState } from "@/lib/setup";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const config = getConfig();
  const state = setupState(getDatabase(), {
    authMode: config.authMode,
    githubToken: config.githubToken,
    asanaToken: config.asanaToken,
  });

  return <SetupWizard initial={state} authMode={config.authMode} />;
}
